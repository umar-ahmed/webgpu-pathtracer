import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "./Renderer";

export class RaytracingPass {
  private renderer: Renderer;
  public pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  public bindGroup: GPUBindGroup;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();
  }

  private createBindGroupLayout() {
    return this.renderer.device.createBindGroupLayout({
      label: "Raytracing Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba8unorm",
            viewDimension: "2d",
          },
        },
      ],
    });
  }

  private createBindGroup() {
    return this.renderer.device.createBindGroup({
      label: "Raytracing Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.renderer.storageTexture.createView(),
        },
      ],
    });
  }

  private createPipeline() {
    return this.renderer.device.createComputePipeline({
      layout: this.renderer.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: this.renderer.device.createShaderModule({
          code: computeShaderCode,
        }),
        entryPoint: "computeMain",
      },
    });
  }

  public render(commandEncoder: GPUCommandEncoder) {
    const computePassEncoder = commandEncoder.beginComputePass({
      label: "Compute Pass",
    });
    computePassEncoder.setPipeline(this.pipeline);
    computePassEncoder.setBindGroup(0, this.bindGroup);
    computePassEncoder.dispatchWorkgroups(
      this.renderer.canvas.width,
      this.renderer.canvas.height,
      1
    );
    computePassEncoder.end();
  }
}
