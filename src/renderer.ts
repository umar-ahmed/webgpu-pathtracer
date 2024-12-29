import { AccumulatePass } from "./passes/accumulate";
import { FullscreenPass } from "./passes/fullscreen";
import { RaytracePass } from "./passes/raytrace";
// import noiseBase64 from "./assets/noise";
import { clamp } from "./utils";
import { RaytracingCamera, RaytracingScene } from "./scene";
import * as THREE from "three";

type RendererEventMap = {
  start: () => void;
  pause: () => void;
  reset: () => void;
  progress: (progress: number) => void;
  complete: () => void;
  resize: () => void;
};

export type RendererEventType = keyof RendererEventMap;

export class Renderer {
  private _canvas: HTMLCanvasElement;
  private _frame: number = 1;
  private passes: {
    raytrace: RaytracePass;
    accumulate: AccumulatePass;
    fullscreen: FullscreenPass;
  };
  private listeners: Map<RendererEventType, any[]> = new Map();

  public context: GPUCanvasContext;
  public device: GPUDevice;
  public format: GPUTextureFormat = "bgra8unorm";
  public outputTexture: GPUTexture;
  public environmentTexture: GPUTexture;
  public environmentSampler: GPUSampler;

  private _scalingFactor: number = 0.25;
  public frames: number = 64;
  public samplesPerFrame: number = 1;
  public status: "idle" | "sampling" | "paused" = "idle";
  public options: {
    readonly enableTimestampQuery: boolean;
  };

  private constructor({
    device,
    format,
    options,
  }: {
    device: GPUDevice;
    format: GPUTextureFormat;
    options?: {
      enableTimestampQuery?: boolean;
    };
  }) {
    this.options = {
      enableTimestampQuery: false,
      ...options,
    };

    this._canvas = document.createElement("canvas");
    const context = this._canvas.getContext("webgpu");
    if (context === null) {
      throw new Error("WebGPU not supported.");
    }

    this.context = context;
    this.device = device;
    this.format = format;

    this.context.configure({ device, format });

    this.outputTexture = this.createStorageTexture();
    this.environmentTexture = this.createEnvironmentTexture();
    this.environmentSampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this.passes = {
      raytrace: new RaytracePass(this),
      accumulate: new AccumulatePass(this),
      fullscreen: new FullscreenPass(this),
    };
  }

  private createStorageTexture() {
    return this.device.createTexture({
      size: {
        width: this.width,
        height: this.height,
        depthOrArrayLayers: 1,
      },
      format: "rgba16float",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC,
    });
  }

  private createEnvironmentTexture() {
    return this.device.createTexture({
      size: {
        width: 1024,
        height: 512,
        depthOrArrayLayers: 1,
      },
      format: "rgba16float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  updateEnvironmentTexture(texture: THREE.Texture) {
    if (texture.image.width !== 1024 || texture.image.height !== 512) {
      throw new Error(
        "Environment texture must be 1024x512 pixels. Please resize the texture and try again."
      );
    }

    if (texture.type !== THREE.HalfFloatType) {
      throw new Error(
        "Environment texture must be a floating point texture. Please convert the texture and try again."
      );
    }

    this.device.queue.writeTexture(
      { texture: this.environmentTexture },
      texture.image.data.buffer,
      {
        bytesPerRow: texture.image.width * 8,
        rowsPerImage: texture.image.height,
      },
      {
        width: texture.image.width,
        height: texture.image.height,
        depthOrArrayLayers: 1,
      }
    );
  }

  resize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this._canvas.width = width;
    this._canvas.height = height;

    // Reset the renderer
    this.reset();

    this.emit("resize");
  }

  get scalingFactor() {
    return this._scalingFactor;
  }

  set scalingFactor(value: number) {
    this._scalingFactor = value;
    this.setUniforms("fullscreen", { scalingFactor: value });
  }

  get width() {
    return this.canvas.width;
  }

  get scaledWidth() {
    return this.canvas.width * this._scalingFactor;
  }

  get height() {
    return this.canvas.height;
  }

  get scaledHeight() {
    return this.canvas.height * this._scalingFactor;
  }

  get aspect() {
    return this.canvas.width / this.canvas.height;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  get hasFramesToSample() {
    return this._frame <= this.frames;
  }

  get progress() {
    return this._frame / (this.frames + 1);
  }

  get frame() {
    return this._frame;
  }

  set frame(value: number) {
    this._frame = value;
    if (this._frame > this.frames) {
      this.status = "idle";
      this.emit("complete");
    }
  }

  get timings() {
    return {
      raytrace: this.passes.raytrace.timingAverage,
      accumulate: this.passes.accumulate.timingAverage,
      fullscreen: this.passes.fullscreen.timingAverage,
    };
  }

  setUniforms(pass: keyof typeof this.passes, value: any) {
    this.passes[pass].setUniforms(value);
  }

  update(scene: RaytracingScene, camera: RaytracingCamera) {
    this.passes.raytrace.updateScene(scene, camera);
  }

  render(scene: RaytracingScene, camera: RaytracingCamera) {
    this.update(scene, camera);

    const shouldSample = this.status === "sampling" && this.hasFramesToSample;

    if (shouldSample) {
      this.frame++;
    }

    this.passes.raytrace.update();
    this.passes.accumulate.update();
    this.passes.fullscreen.update();

    const commandEncoder = this.device.createCommandEncoder();

    if (shouldSample) {
      this.passes.raytrace.render(commandEncoder);
      this.emit("progress", this.progress);
    }

    if (shouldSample) this.passes.accumulate.render(commandEncoder);
    this.passes.fullscreen.render(commandEncoder);

    const commandBuffer = commandEncoder.finish();
    this.device.queue.submit([commandBuffer]);

    if (shouldSample) this.passes.raytrace.updateTimings();
    if (shouldSample) this.passes.accumulate.updateTimings();
    this.passes.fullscreen.updateTimings();
  }

  reset() {
    const prevStatus = this.status;

    // Set to idle so that we don't start sampling yet
    this.status = "paused";

    // Re-create the storage texture with the new size
    this.outputTexture = this.createStorageTexture();

    // Emit the reset event
    this.emit("reset");

    // Reset the frame counter and restore the previous status
    this._frame = 1;
    this.status = prevStatus === "idle" ? "sampling" : prevStatus;

    if (this.status === "sampling") {
      this.emit("start");
    }
  }

  async destroy() {
    // Wait for any pending GPU operations to complete
    await this.device.queue.onSubmittedWorkDone();
    
    // Destroy all textures first
    this.outputTexture.destroy();
    this.environmentTexture.destroy();
    
    // Destroy the device
    this.device.destroy();
    this.canvas.remove();
  }

  start() {
    if (this._frame > this.frames) {
      this.status = "idle";
    } else {
      this.status = "sampling";
    }
  }

  pause() {
    if (this.status !== "paused") {
      this.status = "paused";
      this.emit("pause");
    }
  }

  on(event: "start", callback: () => void): void;
  on(event: "pause", callback: () => void): void;
  on(event: "reset", callback: () => void): void;
  on(event: "progress", callback: (progress: number) => void): void;
  on(event: "complete", callback: () => void): void;
  on(event: "resize", callback: () => void): void;
  on(event: RendererEventType, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)?.push(callback);
  }

  emit(event: "start"): void;
  emit(event: "pause"): void;
  emit(event: "reset"): void;
  emit(event: "progress", progress: number): void;
  emit(event: "complete"): void;
  emit(event: "resize"): void;
  emit(event: RendererEventType, ...args: any[]) {
    this.listeners.get(event)?.forEach((callback: any) => callback(...args));
  }

  static async diagnostic(): Promise<
    { supported: false } | { supported: true; info: GPUAdapterInfo }
  > {
    if ("gpu" in navigator === false) {
      return { supported: false };
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();

      if (adapter === null) {
        return { supported: false };
      }

      return { supported: true, info: adapter.info };
    } catch (err) {
      console.error(err);
      return { supported: false };
    }
  }

  static async create(): Promise<Renderer> {
    const adapter = await navigator.gpu.requestAdapter();

    const hasBGRA8unormStorage =
      adapter?.features.has("bgra8unorm-storage") ?? false;
    const hasTimestampQuery = adapter?.features.has("timestamp-query") ?? false;

    const requiredFeatures: GPUFeatureName[] = [];

    if (hasBGRA8unormStorage) {
      requiredFeatures.push("bgra8unorm-storage");
    }
    if (hasTimestampQuery) {
      requiredFeatures.push("timestamp-query");
    }

    const device = await adapter?.requestDevice({ requiredFeatures });

    if (!device) {
      throw new Error("WebGPU device not found.");
    }

    const format = hasBGRA8unormStorage
      ? navigator.gpu.getPreferredCanvasFormat()
      : "rgba8unorm";

    const renderer = new Renderer({
      device,
      format,
      options: {
        enableTimestampQuery: hasTimestampQuery,
      },
    });

    Renderer.registerResizeObserver(renderer);

    return renderer;
  }

  private static registerResizeObserver(renderer: Renderer) {
    const observer = new ResizeObserver(([entry]) => {
      const dpr = clamp(window.devicePixelRatio, 1, 2);
      const maxDimension = renderer.device.limits.maxTextureDimension2D;
      const width = clamp(
        entry.devicePixelContentBoxSize?.[0].inlineSize ||
          entry.contentBoxSize[0].inlineSize * dpr,
        1,
        maxDimension
      );
      const height = clamp(
        entry.devicePixelContentBoxSize?.[0].blockSize ||
          entry.contentBoxSize[0].blockSize * dpr,
        1,
        maxDimension
      );

      renderer.resize(width, height);
    });

    try {
      observer.observe(renderer.canvas, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(renderer.canvas, { box: "content-box" });
    }
  }

  // private static async loadNoiseTexture(device: GPUDevice) {
  //   const image = new Image();
  //   image.src = noiseBase64;
  //   await image.decode();

  //   const source = await createImageBitmap(image);

  //   const texture = device.createTexture({
  //     label: "Noise Texture",
  //     format: "rgba8unorm",
  //     size: [source.width, source.height],
  //     usage:
  //       GPUTextureUsage.TEXTURE_BINDING |
  //       GPUTextureUsage.COPY_DST |
  //       GPUTextureUsage.RENDER_ATTACHMENT,
  //   });

  //   device.queue.copyExternalImageToTexture(
  //     { source, flipY: true },
  //     { texture },
  //     { width: source.width, height: source.height }
  //   );

  //   await device.queue.onSubmittedWorkDone();

  //   return texture;
  // }
}
