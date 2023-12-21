import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "./Renderer";

export class RaytracingPass {
  private renderer: Renderer;
  private input: Float32Array;
  public workBuffer: GPUBuffer;
  public pipeline: GPUComputePipeline;
  public bindGroup: GPUBindGroup;

  constructor(renderer: Renderer, input: Float32Array) {
    this.renderer = renderer;
    this.input = input;
    this.workBuffer = this.createWorkBuffer();
    this.pipeline = this.createPipeline();
    this.bindGroup = this.createBindGroup();

    this.renderer.device.queue.writeBuffer(this.workBuffer, 0, input);
  }

  private createWorkBuffer() {
    return this.renderer.device.createBuffer({
      label: "Work Buffer",
      size: this.input.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
  }

  private createPipeline() {
    return this.renderer.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.renderer.device.createShaderModule({
          code: computeShaderCode,
        }),
        entryPoint: "computeMain",
      },
    });
  }

  private createBindGroup() {
    return this.renderer.device.createBindGroup({
      label: "Bind Group for Work Buffer",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.workBuffer,
          },
        },
      ],
    });
  }

  public render(commandEncoder: GPUCommandEncoder) {
    const computePassEncoder = commandEncoder.beginComputePass({
      label: "Compute Pass",
    });
    computePassEncoder.setPipeline(this.pipeline);
    computePassEncoder.setBindGroup(0, this.bindGroup);
    computePassEncoder.dispatchWorkgroups(this.input.length);
    computePassEncoder.end();
  }
}
