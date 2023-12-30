import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "../renderer";
import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Pass } from "./pass";
import { Scene, Camera, Mesh } from "../scene";

export class RaytracePass extends Pass {
  public pipeline: GPUComputePipeline;

  private defs = makeShaderDataDefinitions(computeShaderCode);

  private triangleStructuredView: StructuredView;
  private triangleBuffer: GPUBuffer;
  private materialStructuredView: StructuredView;
  private materialBuffer: GPUBuffer;

  private uniforms: StructuredView;
  private uniformsBuffer: GPUBuffer;

  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup;

  constructor(renderer: Renderer) {
    super(renderer);
    this.renderer = renderer;
    this.triangleStructuredView = this.createTriangleStructuredView();
    this.triangleBuffer = this.createTriangleBuffer();
    this.materialStructuredView = this.createMaterialStructuredView();
    this.materialBuffer = this.createMaterialBuffer();
    this.uniforms = this.createUniforms();
    this.uniformsBuffer = this.createUniformsBuffer();
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();

    this.updateTriangleBuffer();
    this.updateMaterialBuffer();

    this.renderer.on("resize", this.reset.bind(this));
    this.renderer.on("reset", this.reset.bind(this));
  }

  private createTriangleStructuredView(): StructuredView {
    return makeStructuredView(
      this.defs.storages.triangleBuffer,
      new ArrayBuffer(this.defs.structs.Triangle.size * 2 * 8 * 8)
    );
  }

  private createTriangleBuffer(): GPUBuffer {
    return this.renderer.device.createBuffer({
      size: this.triangleStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateTriangleBuffer() {
    const s = 0.4;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const x = i * s - (8 * s) / 2;
        const z = j * s - (8 * s) / 2;

        const index = i * 8 + j;

        // Triangle 1
        this.triangleStructuredView.views[index].a.set([x, 0, z]);
        this.triangleStructuredView.views[index].b.set([x + s, 0, z]);
        this.triangleStructuredView.views[index].c.set([x + s, 0, z + s]);
        this.triangleStructuredView.views[index].aNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index].bNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index].cNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index].materialIndex.set([
          (i + j) % 2,
        ]);

        // Triangle 2
        this.triangleStructuredView.views[index + 64].a.set([x, 0, z]);
        this.triangleStructuredView.views[index + 64].b.set([x + s, 0, z + s]);
        this.triangleStructuredView.views[index + 64].c.set([x, 0, z + s]);
        this.triangleStructuredView.views[index + 64].aNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index + 64].bNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index + 64].cNormal.set([0, 1, 0]);
        this.triangleStructuredView.views[index + 64].materialIndex.set([
          (i + j) % 2,
        ]);
      }
    }

    this.renderer.device.queue.writeBuffer(
      this.triangleBuffer,
      0,
      this.triangleStructuredView.arrayBuffer
    );
  }

  private createMaterialStructuredView(): StructuredView {
    return makeStructuredView(
      this.defs.storages.materialBuffer,
      new ArrayBuffer(this.defs.structs.Material.size * 2)
    );
  }

  private createMaterialBuffer(): GPUBuffer {
    return this.renderer.device.createBuffer({
      size: this.materialStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateMaterialBuffer() {
    // Material 1
    this.materialStructuredView.views[0].color.set([0, 0, 0]);
    this.materialStructuredView.views[0].specularColor.set([1, 1, 1]);
    this.materialStructuredView.views[0].roughness.set([0.0]);
    this.materialStructuredView.views[0].metalness.set([0.0]);
    this.materialStructuredView.views[0].emissionColor.set([1, 0, 0]);
    this.materialStructuredView.views[0].emissionStrength.set([1.0]);

    // Material 2
    this.materialStructuredView.views[1].color.set([0, 0, 0]);
    this.materialStructuredView.views[1].specularColor.set([1, 1, 1]);
    this.materialStructuredView.views[1].roughness.set([0.0]);
    this.materialStructuredView.views[1].metalness.set([0.0]);
    this.materialStructuredView.views[1].emissionColor.set([1, 1, 1]);
    this.materialStructuredView.views[1].emissionStrength.set([1.0]);

    this.renderer.device.queue.writeBuffer(
      this.materialBuffer,
      0,
      this.materialStructuredView.arrayBuffer
    );
  }

  private createUniforms() {
    console.log(this.defs);
    return makeStructuredView(this.defs.uniforms.uniforms);
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
            type: "read-only-storage",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
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
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
          },
        },
        {
          binding: 5,
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
            label: "Triangle Buffer",
            buffer: this.triangleBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            label: "Material Buffer",
            buffer: this.materialBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            label: "Uniforms Buffer",
            buffer: this.uniformsBuffer,
          },
        },
        {
          binding: 3,
          resource: this.renderer.noiseTexture.createView(),
        },
        {
          binding: 4,
          resource: this.renderer.outputTexture.createView(),
        },
        {
          binding: 5,
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

  public update() {
    this.setUniforms({
      resolution: [this.renderer.scaledWidth, this.renderer.scaledHeight],
      aspect: this.renderer.aspect,
      frame: this.renderer.frame,
      samplesPerFrame: this.renderer.samplesPerFrame,
    });
  }

  updateScene(scene: Scene, camera: Camera) {
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        meshes.push(object);
      }
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
