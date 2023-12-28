import noiseBase64 from "./assets/noise";

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
  private listeners: Map<RendererEventType, any[]> = new Map();

  public context: GPUCanvasContext;
  public device: GPUDevice;
  public format: GPUTextureFormat = "bgra8unorm";
  public outputTexture: GPUTexture;
  public outputTexturePrev: GPUTexture;
  public noiseTexture: GPUTexture;
  public scalingFactor: number = 1;
  public frames: number = 64;
  public samplesPerFrame: number = 2;
  public status: "idle" | "sampling" | "paused" = "idle";

  static async supported(): Promise<boolean> {
    if ("gpu" in navigator === false) {
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();

      if (adapter === null) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  static async create(): Promise<Renderer> {
    const adapter = await navigator.gpu.requestAdapter();

    const hasBGRA8unormStorage = adapter?.features.has("bgra8unorm-storage");

    const device = await adapter?.requestDevice({
      requiredFeatures: hasBGRA8unormStorage ? ["bgra8unorm-storage"] : [],
    });

    if (!device) {
      throw new Error("WebGPU device not found.");
    }

    const format = hasBGRA8unormStorage
      ? navigator.gpu.getPreferredCanvasFormat()
      : "rgba8unorm";

    const noiseTexture = await Renderer.loadNoiseTexture(device);
    const renderer = new Renderer(device, format, noiseTexture);

    return renderer;
  }

  private static async loadNoiseTexture(device: GPUDevice) {
    const image = new Image();
    image.src = noiseBase64;
    await image.decode();

    const source = await createImageBitmap(image);

    const texture = device.createTexture({
      label: "Noise Texture",
      format: "rgba8unorm",
      size: [source.width, source.height],
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source, flipY: true },
      { texture },
      { width: source.width, height: source.height }
    );

    await device.queue.onSubmittedWorkDone();

    return texture;
  }

  private constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    noiseTexture: GPUTexture
  ) {
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
    this.outputTexturePrev = this.createStorageTexture();
    this.noiseTexture = noiseTexture;
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

  get width() {
    return this.canvas.width;
  }

  get scaledWidth() {
    return this.canvas.width * this.scalingFactor;
  }

  get height() {
    return this.canvas.height;
  }

  get scaledHeight() {
    return this.canvas.height * this.scalingFactor;
  }

  get aspect() {
    return this.canvas.width / this.canvas.height;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  public isSampling() {
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

  reset() {
    const prevStatus = this.status;

    // Set to idle so that we don't start sampling yet
    this.status = "paused";

    // Re-create the storage texture with the new size
    this.outputTexture = this.createStorageTexture();
    this.outputTexturePrev = this.createStorageTexture();

    // Emit the reset event
    this.emit("reset");

    // Reset the frame counter and restore the previous status
    this._frame = 1;
    this.status = prevStatus === "idle" ? "sampling" : prevStatus;

    if (this.status === "sampling") {
      this.emit("start");
    }
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
}
