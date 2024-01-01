import computeShaderCode from "./shaders/raytrace.wgsl?raw";
import { Renderer } from "../renderer";
import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Pass } from "./pass";
import * as THREE from "three";
import { RaytracingCamera, RaytracingMaterial } from "../scene";

type Triangle = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  aNormal: THREE.Vector3;
  bNormal: THREE.Vector3;
  cNormal: THREE.Vector3;
  materialIndex: number;
};

type BVHNode = {
  min: THREE.Vector3;
  max: THREE.Vector3;
  left: number;
  right: number;
  triangleIndex: number;
  triangleCount: number;
  isLeaf: boolean;
};

export class RaytracePass extends Pass {
  public pipeline: GPUComputePipeline;

  private defs = makeShaderDataDefinitions(computeShaderCode);

  private triangleStructuredView: StructuredView;
  private triangleBuffer: GPUBuffer;
  private materialStructuredView: StructuredView;
  private materialBuffer: GPUBuffer;
  private bvhStructuredView: StructuredView;
  private bvhBuffer: GPUBuffer;

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
    this.bvhStructuredView = this.createBVHStructuredView(1);
    this.bvhBuffer = this.createBVHBuffer();

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
      label: "Triangle Buffer",
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
      label: "Material Buffer",
      size: this.materialStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateMaterialBuffer(materials: RaytracingMaterial[]) {
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      this.materialStructuredView.views[i].color.set(m.color.toArray());
      this.materialStructuredView.views[i].specularColor.set(
        m.specularColor.toArray()
      );
      this.materialStructuredView.views[i].roughness.set([m.roughness]);
      this.materialStructuredView.views[i].metalness.set([m.metalness]);
      this.materialStructuredView.views[i].emissionColor.set(
        m.emissive.toArray()
      );
      this.materialStructuredView.views[i].emissionStrength.set([
        m.emissiveIntensity,
      ]);
    }

    this.renderer.device.queue.writeBuffer(
      this.materialBuffer,
      0,
      this.materialStructuredView.arrayBuffer
    );
  }

  private createBVHStructuredView(bvhCount: number): StructuredView {
    return makeStructuredView(
      this.defs.storages.bvhBuffer,
      new ArrayBuffer(this.defs.structs.BVHNode.size * bvhCount)
    );
  }

  private createBVHBuffer(): GPUBuffer {
    return this.renderer.device.createBuffer({
      label: "BVH Buffer",
      size: this.bvhStructuredView.arrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateBVHBuffer(nodes: BVHNode[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.bvhStructuredView.views[i].min.set(node.min.toArray());
      this.bvhStructuredView.views[i].max.set(node.max.toArray());
      this.bvhStructuredView.views[i].left.set([node.left]);
      this.bvhStructuredView.views[i].right.set([node.right]);
      this.bvhStructuredView.views[i].triangleIndex.set([node.triangleIndex]);
      this.bvhStructuredView.views[i].triangleCount.set([node.triangleCount]);
      this.bvhStructuredView.views[i].isLeaf.set([node.isLeaf ? 1 : 0]);
    }

    this.renderer.device.queue.writeBuffer(
      this.bvhBuffer,
      0,
      this.bvhStructuredView.arrayBuffer
    );
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
            type: "read-only-storage",
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: "2d",
            sampleType: "float",
            multisampled: false,
          },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
          },
        },
        {
          binding: 6,
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
            label: "BVH Buffer",
            buffer: this.bvhBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            label: "Uniforms Buffer",
            buffer: this.uniformsBuffer,
          },
        },
        {
          binding: 4,
          resource: this.renderer.noiseTexture.createView(),
        },
        {
          binding: 5,
          resource: this.renderer.outputTexture.createView(),
        },
        {
          binding: 6,
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

  updateScene(scene: THREE.Scene, camera: RaytracingCamera) {
    // Update camera uniforms
    this.setUniforms({
      camera: {
        position: camera.getWorldPosition(new THREE.Vector3()).toArray(),
        direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        fov: camera.fov,
        focalDistance: camera.focalDistance,
        aperture: camera.aperture,
      },
    });

    // Update triangle and material buffers
    const meshes: THREE.Mesh<
      THREE.BufferGeometry<THREE.NormalBufferAttributes>,
      RaytracingMaterial
    >[] = [];

    scene.updateMatrixWorld(true);

    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        object.material instanceof RaytracingMaterial
      ) {
        meshes.push(object);
      }
    });

    const triangles: Triangle[] = [];
    const materials: RaytracingMaterial[] = [];

    meshes.forEach((mesh) => {
      const indices = mesh.geometry.getIndex();
      const positions = mesh.geometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const normals = mesh.geometry.getAttribute(
        "normal"
      ) as THREE.BufferAttribute;

      if (indices) {
        for (let i = 0; i < indices.array.length; i += 3) {
          const aIndex = indices.array[i + 0];
          const bIndex = indices.array[i + 1];
          const cIndex = indices.array[i + 2];

          const aPosition = new THREE.Vector3().fromBufferAttribute(
            positions,
            aIndex
          );
          const bPosition = new THREE.Vector3().fromBufferAttribute(
            positions,
            bIndex
          );
          const cPosition = new THREE.Vector3().fromBufferAttribute(
            positions,
            cIndex
          );

          // Transform positions to world space
          aPosition.applyMatrix4(mesh.matrixWorld);
          bPosition.applyMatrix4(mesh.matrixWorld);
          cPosition.applyMatrix4(mesh.matrixWorld);

          const aNormal = new THREE.Vector3().fromBufferAttribute(
            normals,
            aIndex
          );
          const bNormal = new THREE.Vector3().fromBufferAttribute(
            normals,
            bIndex
          );
          const cNormal = new THREE.Vector3().fromBufferAttribute(
            normals,
            cIndex
          );

          // Transform normals to world space
          aNormal.applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
          );
          bNormal.applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
          );
          cNormal.applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
          );

          let materialIndex = materials.indexOf(mesh.material);

          if (materialIndex === -1) {
            materialIndex = materials.length;
            materials.push(mesh.material);
          }

          triangles.push({
            a: aPosition,
            b: bPosition,
            c: cPosition,
            aNormal,
            bNormal,
            cNormal,
            materialIndex,
          });
        }
      } else {
        console.warn("Mesh does not have indices");
      }
    });

    // Build BVH
    const bvhNodes: BVHNode[] = [
      {
        min: new THREE.Vector3(-10, -10, -10),
        max: new THREE.Vector3(10, 10, 10),
        left: -1,
        right: -1,
        triangleIndex: 0,
        triangleCount: triangles.length,
        isLeaf: true,
      },
    ];

    this.triangleStructuredView = this.createTriangleStructuredView(
      triangles.length
    );
    this.triangleBuffer = this.createTriangleBuffer();
    this.materialStructuredView = this.createMaterialStructuredView(
      materials.length
    );
    this.materialBuffer = this.createMaterialBuffer();
    this.bvhStructuredView = this.createBVHStructuredView(bvhNodes.length);
    this.bvhBuffer = this.createBVHBuffer();

    this.updateTriangleBuffer(triangles);
    this.updateMaterialBuffer(materials);
    this.updateBVHBuffer(bvhNodes);
  }

  public render(commandEncoder: GPUCommandEncoder) {
    const workgroupsX = Math.ceil(this.renderer.scaledWidth / 8);
    const workgroupsY = Math.ceil(this.renderer.scaledHeight / 8);

    const computePassEncoder = this.timingHelper.beginComputePass(
      commandEncoder,
      { label: "Compute Pass" }
    );
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
