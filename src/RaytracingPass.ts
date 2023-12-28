import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "./Renderer";
import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";

export class RaytracingPass {
  private renderer: Renderer;
  public pipeline: GPUComputePipeline;
  private uniforms: StructuredView;
  private uniformsBuffer: GPUBuffer;
  private bindGroupLayout: GPUBindGroupLayout;
  public bindGroup: GPUBindGroup;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.uniforms = this.createUniforms();
    this.uniformsBuffer = this.createUniformsBuffer();
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();

    this.renderer.on("resize", this.reset.bind(this));
    this.renderer.on("reset", this.reset.bind(this));
  }

  private createUniforms() {
    const defs = makeShaderDataDefinitions(computeShaderCode);
    return makeStructuredView(defs.uniforms.uniforms);
  }

  private createUniformsBuffer() {
    return this.renderer.device.createBuffer({
      label: "Uniforms Buffer",
      size: this.uniforms.arrayBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createBindGroupLayout() {
    return this.renderer.device.createBindGroupLayout({
      label: "Raytracing Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: "2d",
            sampleType: "float",
            multisampled: false,
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: "2d",
            sampleType: "float",
            multisampled: false,
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
          resource: {
            buffer: this.uniformsBuffer,
          },
        },
        {
          binding: 1,
          resource: this.renderer.noiseTexture.createView(),
        },
        {
          binding: 2,
          resource: this.renderer.outputTexture.createView(),
        },
        {
          binding: 3,
          resource: this.renderer.outputTexturePrev.createView(),
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

  private reset() {
    // Re-create the bind group with the new storage texture view
    this.bindGroup = this.createBindGroup();
  }

  public setUniforms(value: any) {
    this.uniforms.set(value);

    if (this.uniformsBuffer) {
      this.renderer.device.queue.writeBuffer(
        this.uniformsBuffer,
        0,
        this.uniforms.arrayBuffer
      );
    }
  }

  public update({ time }: { time: number }) {
    if (this.renderer.isSampling()) {
      this.renderer.frame++;
    }

    this.setUniforms({
      resolution: [this.renderer.scaledWidth, this.renderer.scaledHeight],
      aspect: this.renderer.aspect,
      frame: this.renderer.frame,
      time,
    });
  }

  public render(commandEncoder: GPUCommandEncoder) {
    const workgroupsX = Math.ceil(this.renderer.scaledWidth / 8);
    const workgroupsY = Math.ceil(this.renderer.scaledHeight / 8);

    const computePassEncoder = commandEncoder.beginComputePass({
      label: "Compute Pass",
    });
    computePassEncoder.setPipeline(this.pipeline);
    computePassEncoder.setBindGroup(0, this.bindGroup);
    computePassEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    computePassEncoder.end();

    commandEncoder.copyTextureToTexture(
      { texture: this.renderer.outputTexture, mipLevel: 0 },
      { texture: this.renderer.outputTexturePrev },
      [this.renderer.width, this.renderer.height, 1]
    );
  }
}
