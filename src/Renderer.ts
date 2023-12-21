export class Renderer {
  private _canvas: HTMLCanvasElement;
  public context: GPUCanvasContext;
  public device: GPUDevice;
  public format: GPUTextureFormat = "bgra8unorm";

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

  constructor(device: GPUDevice) {
    this._canvas = document.createElement("canvas");

    const context = this._canvas.getContext("webgpu");
    if (context === null) {
      throw new Error("WebGPU not supported.");
    }

    this.context = context;
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({ device, format: this.format });
  }

  setSize(width: number, height: number) {
    this._canvas.width = width;
    this._canvas.height = height;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }
}
