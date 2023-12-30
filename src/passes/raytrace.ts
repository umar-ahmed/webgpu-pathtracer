import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "../renderer";
import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Pass } from "./pass";
import { Scene, Camera, Mesh, Material, Vector3 } from "../scene";

type Triangle = {
  a: Vector3;
  b: Vector3;
  c: Vector3;
  aNormal: Vector3;
  bNormal: Vector3;
  cNormal: Vector3;
  materialIndex: number;
};

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

    this.triangleStructuredView = this.createTriangleStructuredView(2);
    this.triangleBuffer = this.createTriangleBuffer();
    this.materialStructuredView = this.createMaterialStructuredView(1);
    this.materialBuffer = this.createMaterialBuffer();

    this.uniforms = this.createUniforms();
    this.uniformsBuffer = this.createUniformsBuffer();
    this.bindGroupLayout = this.createBindGroupLayout();
    this.bindGroup = this.createBindGroup();
    this.pipeline = this.createPipeline();

    this.renderer.on("resize", this.reset.bind(this));
    this.renderer.on("reset", this.reset.bind(this));
  }

  private createTriangleStructuredView(triangleCount: number): StructuredView {
    return makeStructuredView(
      this.defs.storages.triangleBuffer,
      new ArrayBuffer(this.defs.structs.Triangle.size * triangleCount)
    );
  }

  private createTriangleBuffer(): GPUBuffer {
    return this.renderer.device.createBuffer({
      size: this.triangleStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateTriangleBuffer(triangles: Triangle[]) {
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      this.triangleStructuredView.views[i].a.set(t.a.toArray());
      this.triangleStructuredView.views[i].b.set(t.b.toArray());
      this.triangleStructuredView.views[i].c.set(t.c.toArray());
      this.triangleStructuredView.views[i].aNormal.set(t.aNormal.toArray());
      this.triangleStructuredView.views[i].bNormal.set(t.bNormal.toArray());
      this.triangleStructuredView.views[i].cNormal.set(t.cNormal.toArray());
      this.triangleStructuredView.views[i].materialIndex.set([t.materialIndex]);
    }

    this.renderer.device.queue.writeBuffer(
      this.triangleBuffer,
      0,
      this.triangleStructuredView.arrayBuffer
    );
  }

  private createMaterialStructuredView(materialsCount: number): StructuredView {
    return makeStructuredView(
      this.defs.storages.materialBuffer,
      new ArrayBuffer(this.defs.structs.Material.size * materialsCount)
    );
  }

  private createMaterialBuffer(): GPUBuffer {
    return this.renderer.device.createBuffer({
      size: this.materialStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateMaterialBuffer(materials: Material[]) {
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      this.materialStructuredView.views[i].color.set(m.color.toArray());
      this.materialStructuredView.views[i].specularColor.set(
        m.specularColor.toArray()
      );
      this.materialStructuredView.views[i].roughness.set([m.roughness]);
      this.materialStructuredView.views[i].metalness.set([m.metalness]);
      this.materialStructuredView.views[i].emissionColor.set(
        m.emissionColor.toArray()
      );
      this.materialStructuredView.views[i].emissionStrength.set([
        m.emissionStrength,
      ]);
    }

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
    // Update camera uniforms
    this.setUniforms({
      camera: {
        position: camera.position.toArray(),
        direction: camera.direction.toArray(),
        fov: camera.fov,
        focalDistance: camera.focalDistance,
        aperture: camera.aperture,
      },
    });

    // TODO: Update triangle and material buffers
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        meshes.push(object);
      }
    });

    const triangles: Triangle[] = [];
    const materials: Material[] = [];

    meshes.forEach((mesh) => {
      const vertices = mesh.geometry.vertices;
      const normals = mesh.geometry.normals;

      console.assert(vertices.length === normals.length);

      for (let i = 0; i < vertices.length; i += 3) {
        const a = vertices[i + 0];
        const b = vertices[i + 1];
        const c = vertices[i + 2];

        const aNormal = normals[i + 0];
        const bNormal = normals[i + 1];
        const cNormal = normals[i + 2];

        let materialIndex = materials.indexOf(mesh.material);

        if (materialIndex === -1) {
          materialIndex = materials.length;
          materials.push(mesh.material);
        }

        triangles.push({ a, b, c, aNormal, bNormal, cNormal, materialIndex });
      }
    });

    this.triangleStructuredView = this.createTriangleStructuredView(
      triangles.length
    );
    this.triangleBuffer = this.createTriangleBuffer();
    this.materialStructuredView = this.createMaterialStructuredView(
      materials.length
    );
    this.materialBuffer = this.createMaterialBuffer();

    this.updateTriangleBuffer(triangles);
    this.updateMaterialBuffer(materials);
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
