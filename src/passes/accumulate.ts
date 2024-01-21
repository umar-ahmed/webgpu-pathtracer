import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Renderer } from "../renderer";
import { Pass } from "./pass";
import computeShaderCode from "./shaders/accumulate.wgsl";

export class AccumulatePass extends Pass {
  private outputTexturePrev: GPUTexture;
  private accumulationTexture: GPUTexture;
  private pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup;
  private uniforms: StructuredView;
  private uniformsBuffer: GPUBuffer;

  private defs = makeShaderDataDefinitions(computeShaderCode);

  constructor(renderer: Renderer) {
    super(renderer);

    this.uniforms = this.createUniforms();
    this.uniformsBuffer = this.createUniformsBuffer();
    this.outputTexturePrev = this.createStorageTexture();
    this.accumulationTexture = this.createStorageTexture();
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();

    this.renderer.on("resize", this.reset.bind(this));
    this.renderer.on("reset", this.reset.bind(this));
  }

  private reset() {
    // Re-create the storage textures
    this.outputTexturePrev = this.createStorageTexture();
    this.accumulationTexture = this.createStorageTexture();

    // Re-create the bind group with the new storage texture view
    this.bindGroup = this.createBindGroup();
  }

  private createStorageTexture() {
    return this.renderer.device.createTexture({
      size: {
        width: this.renderer.width,
        height: this.renderer.height,
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

  private createBindGroupLayout() {
    return this.renderer.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: "2d",
            sampleType: "float",
            multisampled: false,
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
            viewDimension: "2d",
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });
  }

  private createBindGroup() {
    return this.renderer.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.renderer.outputTexture.createView(),
        },
        {
          binding: 1,
          resource: this.outputTexturePrev.createView(),
        },
        {
          binding: 2,
          resource: this.accumulationTexture.createView(),
        },
        {
          binding: 3,
          resource: {
            buffer: this.uniformsBuffer,
          },
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

  private createUniforms() {
    return makeStructuredView(this.defs.uniforms.uniforms);
  }

  private createUniformsBuffer() {
    return this.renderer.device.createBuffer({
      label: "Uniforms Buffer",
      size: this.uniforms.arrayBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  render(encoder: GPUCommandEncoder): void {
    const workgroupsX = Math.ceil(this.renderer.width / 8);
    const workgroupsY = Math.ceil(this.renderer.height / 8);

    const computePassEncoder = this.timingHelper.beginComputePass(encoder, {
      label: "Accumulate Pass",
    });
    computePassEncoder.setPipeline(this.pipeline);
    computePassEncoder.setBindGroup(0, this.bindGroup);
    computePassEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    computePassEncoder.end();

    encoder.copyTextureToTexture(
      { texture: this.accumulationTexture, mipLevel: 0 },
      { texture: this.outputTexturePrev },
      [this.renderer.width, this.renderer.height, 1]
    );
    encoder.copyTextureToTexture(
      { texture: this.accumulationTexture, mipLevel: 0 },
      { texture: this.renderer.outputTexture },
      [this.renderer.width, this.renderer.height, 1]
    );
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

  public update() {
    this.setUniforms({
      resolution: [this.renderer.scaledWidth, this.renderer.scaledHeight],
      frame: this.renderer.frame,
    });
  }
}
