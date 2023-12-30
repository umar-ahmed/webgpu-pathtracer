import { Renderer } from "../renderer";

export abstract class Pass {
  protected renderer: Renderer;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  abstract render(commandEncoder: GPUCommandEncoder): void;
  abstract update(): void;
}
