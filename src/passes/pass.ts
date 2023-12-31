import { Renderer } from "../renderer";
import { NoTimingHelper, RollingAverage, TimingHelper } from "../timing";

export abstract class Pass {
  protected renderer: Renderer;
  protected timingHelper: TimingHelper | NoTimingHelper;
  public timingAverage = new RollingAverage();

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    if (this.renderer.options.enableTimestampQuery) {
      this.timingHelper = new TimingHelper(this.renderer.device);
    } else {
      this.timingHelper = new NoTimingHelper();
    }
  }

  abstract render(commandEncoder: GPUCommandEncoder): void;
  abstract update(): void;

  updateTimings() {
    this.timingHelper.getResult().then((gpuTime) => {
      this.timingAverage.addSample(gpuTime / 1000);
    });
  }
}
