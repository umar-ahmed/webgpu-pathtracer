import noiseBase64 from "./assets/noise";

export class Renderer {
  static MAX_SAMPLES = 256;

  private _canvas: HTMLCanvasElement;
  public context: GPUCanvasContext;
  public device: GPUDevice;
  public format: GPUTextureFormat = "bgra8unorm";
  public outputTexture: GPUTexture;
  public outputTexturePrev: GPUTexture;
  public noiseTexture: GPUTexture;
  public frame: number = 1;

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
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: "rgba8unorm",
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

    this.frame = 1;

    // Re-create the storage texture with the new size
    this.outputTexture = this.createStorageTexture();
    this.outputTexturePrev = this.createStorageTexture();
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  public isSampling() {
    return this.frame <= Renderer.MAX_SAMPLES;
  }
}
