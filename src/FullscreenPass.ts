import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Renderer } from "./Renderer";
import fullscreenCode from "./shaders/fullscreen.wgsl?raw";

export class FullscreenPass {
  private renderer: Renderer;
  private uniforms: StructuredView;
  private uniformsBuffer: GPUBuffer;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup;
  private pipeline: GPURenderPipeline;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.uniforms = this.createUniforms();
    this.uniformsBuffer = this.createUniformsBuffer();
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();
  }

  private createUniforms() {
    const defs = makeShaderDataDefinitions(fullscreenCode);
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
      label: "Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });
  }

  private createBindGroup() {
    return this.renderer.device.createBindGroup({
      label: "Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformsBuffer,
          },
        },
      ],
    });
  }

  private createPipeline() {
    const module = this.renderer.device.createShaderModule({
      label: "Fullscreen Shader Module",
      code: fullscreenCode,
    });

    return this.renderer.device.createRenderPipeline({
      label: "Fullscreen Pipeline",
      layout: this.renderer.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      primitive: {
        topology: "triangle-list",
      },
      vertex: {
        module,
        entryPoint: "vertexMain",
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: this.renderer.format }],
      },
    });
  }

  public update({ time }: { time: number }) {
    this.uniforms.set({
      resolution: [this.renderer.canvas.width, this.renderer.canvas.height],
      aspect: this.renderer.canvas.width / this.renderer.canvas.height,
      time,
    });

    if (this.uniformsBuffer) {
      this.renderer.device.queue.writeBuffer(
        this.uniformsBuffer,
        0,
        this.uniforms.arrayBuffer
      );
    }
  }

  public render(commandEncoder: GPUCommandEncoder) {
    const renderPassEncoder = commandEncoder.beginRenderPass({
      label: "Fullscreen Render Pass",
      colorAttachments: [
        {
          view: this.renderer.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPassEncoder.setPipeline(this.pipeline);
    renderPassEncoder.setBindGroup(0, this.bindGroup);
    renderPassEncoder.draw(6);
    renderPassEncoder.end();
  }
}
