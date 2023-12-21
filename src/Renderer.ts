export class Renderer {
  private _canvas: HTMLCanvasElement;
  public context: GPUCanvasContext;
  public device: GPUDevice;
  public format: GPUTextureFormat = "bgra8unorm";
  public storageTexture: GPUTexture;

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

    return new Renderer(device, format);
  }

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this._canvas = document.createElement("canvas");

    const context = this._canvas.getContext("webgpu");
    if (context === null) {
      throw new Error("WebGPU not supported.");
    }

    this.context = context;
    this.device = device;
    this.format = format;

    this.context.configure({ device, format });

    this.storageTexture = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      dimension: "2d",
    });
  }

  setSize(width: number, height: number) {
    this._canvas.width = width;
    this._canvas.height = height;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }
}
