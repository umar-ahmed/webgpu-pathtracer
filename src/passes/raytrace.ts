import computeShaderCode from "./shaders/raytrace.wgsl";
import { Renderer } from "../renderer";
import {
  StructuredView,
  makeShaderDataDefinitions,
  makeStructuredView,
} from "webgpu-utils";
import { Pass } from "./pass";
import * as THREE from "three";
import {
  RaytracingCamera,
  RaytracingMaterial,
  RaytracingScene,
} from "../scene";

type Triangle = {
  aPosition: THREE.Vector3;
  bPosition: THREE.Vector3;
  cPosition: THREE.Vector3;
  aNormal: THREE.Vector3;
  bNormal: THREE.Vector3;
  cNormal: THREE.Vector3;
  materialIndex: number;
};

type BVHLeafNode = {
  bbox: THREE.Box3;
  isLeaf: true;
  triangleIndex: number;
};

type BVHInternalNode = {
  bbox: THREE.Box3;
  isLeaf: false;
  left: BVHNode;
  right: BVHNode;
};

type BVHNode = BVHLeafNode | BVHInternalNode;

type BVHNodeFlat = {
  min: number[];
  max: number[];
  isLeaf: number;
  left: number;
  right: number;
  triangleIndex: number;
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
      this.triangleStructuredView.views[i].aPosition.set(t.aPosition.toArray());
      this.triangleStructuredView.views[i].bPosition.set(t.bPosition.toArray());
      this.triangleStructuredView.views[i].cPosition.set(t.cPosition.toArray());
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

  private updateBVHBuffer(nodes: BVHNodeFlat[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.bvhStructuredView.views[i].min.set(node.min);
      this.bvhStructuredView.views[i].max.set(node.max);
      this.bvhStructuredView.views[i].isLeaf.set([node.isLeaf]);
      this.bvhStructuredView.views[i].left.set([node.left]);
      this.bvhStructuredView.views[i].right.set([node.right]);
      this.bvhStructuredView.views[i].triangleIndex.set([node.triangleIndex]);
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
          sampler: {
            type: "filtering",
          },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
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
          resource: this.renderer.environmentTexture.createView(),
        },
        {
          binding: 5,
          resource: this.renderer.environmentTextureSampler,
        },
        {
          binding: 6,
          resource: this.renderer.outputTexture.createView(),
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

  updateScene(scene: RaytracingScene, camera: RaytracingCamera) {
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

    if (!scene.needsUpdate) {
      return;
    }

    // Update scene matrix world
    scene.updateMatrixWorld(true);

    // Get scene environment and update texture view
    const environment = scene.environment;
    if (environment) {
      this.renderer.updateEnvironmentTexture(environment);
      this.bindGroup = this.createBindGroup();
    }

    // Get all meshes to render
    const meshes: THREE.Mesh<
      THREE.BufferGeometry<THREE.NormalBufferAttributes>,
      RaytracingMaterial
    >[] = [];
    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        object.material instanceof RaytracingMaterial
      ) {
        meshes.push(object);
      }
    });

    // Build list of triangles and materials
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
          aNormal
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
            .normalize();
          bNormal
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
            .normalize();
          cNormal
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
            .normalize();

          let materialIndex = materials.indexOf(mesh.material);

          if (materialIndex === -1) {
            materialIndex = materials.length;
            materials.push(mesh.material);
          }

          triangles.push({
            aPosition: aPosition,
            bPosition: bPosition,
            cPosition: cPosition,
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

    // Build BVH and update BVH buffer
    const bvh = this.buildBVH(triangles);
    const nodes = this.flattenBVH(bvh);
    this.bvhStructuredView = this.createBVHStructuredView(nodes.length);
    this.bvhBuffer = this.createBVHBuffer();
    this.updateBVHBuffer(nodes);

    // Update triangle buffers
    this.triangleStructuredView = this.createTriangleStructuredView(
      triangles.length
    );
    this.triangleBuffer = this.createTriangleBuffer();
    this.updateTriangleBuffer(triangles);

    // Update material buffers
    this.materialStructuredView = this.createMaterialStructuredView(
      materials.length
    );
    this.materialBuffer = this.createMaterialBuffer();
    this.updateMaterialBuffer(materials);

    // Mark scene as updated
    scene.needsUpdate = false;

    console.table({
      Triangles: triangles.length,
      Materials: materials.length,
      "BVH Nodes": nodes.length,
    });
  }

  /**
   * Build BVH tree from input triangles and return the root node.
   *
   * @param triangles input triangles
   */
  private buildBVH(triangles: Triangle[]): BVHNode {
    const inputNodes: BVHNode[] = [];

    // Create node for each triangle
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      const bbox = new THREE.Box3().setFromPoints([
        t.aPosition,
        t.bPosition,
        t.cPosition,
      ]);
      inputNodes.push({
        bbox,
        isLeaf: true,
        triangleIndex: i,
      });
    }

    // Build BVH tree
    return this.buildBVHRecursive(inputNodes);
  }

  private buildBVHRecursive(inputNodes: BVHNode[]): BVHNode {
    if (inputNodes.length === 0) {
      throw new Error("Input nodes array is empty");
    }

    if (inputNodes.length === 1) {
      // If there is only one input node, return it as a leaf node
      return inputNodes[0];
    }

    // Create a new node
    const node: BVHInternalNode = {
      bbox: new THREE.Box3(),
      isLeaf: false,
      left: null!,
      right: null!,
    };

    // Calculate bounding box of all input nodes
    for (const inputNode of inputNodes) {
      node.bbox.expandByPoint(inputNode.bbox.min);
      node.bbox.expandByPoint(inputNode.bbox.max);
    }

    // If there are only two input nodes, use them as children
    if (inputNodes.length === 2) {
      node.left = inputNodes[0];
      node.right = inputNodes[1];
    } else {
      // Find the longest axis of the bounding box
      const size = node.bbox.getSize(new THREE.Vector3());
      const axis = size.x > size.y ? (size.x > size.z ? "x" : "z") : "y";

      // Sort input nodes by their center position on the longest axis
      inputNodes.sort((a, b) => {
        const centerA = a.bbox.getCenter(new THREE.Vector3())[axis];
        const centerB = b.bbox.getCenter(new THREE.Vector3())[axis];
        return centerA - centerB;
      });

      // Calculate the cost of splitting at each possible position
      let minCost = Infinity;
      let minIndex = -1;

      function computeBBox(nodes: BVHNode[]) {
        const bbox = new THREE.Box3();
        for (const node of nodes) {
          bbox.expandByPoint(node.bbox.min);
          bbox.expandByPoint(node.bbox.max);
        }
        return bbox;
      }

      function getSurfaceArea(box: THREE.Box3): number {
        const size = new THREE.Vector3();
        box.getSize(size);

        const x = size.x;
        const y = size.y;
        const z = size.z;

        return 2 * (x * y + x * z + y * z);
      }

      for (let i = 1; i < inputNodes.length; i++) {
        const leftNodes = inputNodes.slice(0, i);
        const rightNodes = inputNodes.slice(i);

        const leftBBox = computeBBox(leftNodes);
        const rightBBox = computeBBox(rightNodes);

        const leftArea = getSurfaceArea(leftBBox);
        const rightArea = getSurfaceArea(rightBBox);

        const cost =
          leftArea * leftNodes.length + rightArea * rightNodes.length;

        if (cost < minCost) {
          minCost = cost;
          minIndex = i;
        }
      }

      // Split input nodes base on the minimum cost
      const leftNodes = inputNodes.slice(0, minIndex);
      const rightNodes = inputNodes.slice(minIndex);

      // Recursively build BVH tree for the two halves
      node.left = this.buildBVHRecursive(leftNodes);
      node.right = this.buildBVHRecursive(rightNodes);
    }

    return node;
  }

  /**
   * Flatten BVH tree into a flat array of nodes. The nodes are stored in a
   * breadth-first order. Each node has a left and right index that points to
   * the children nodes. If the node is a leaf node, the left and right index
   * will be -1 and the triangle index will point to the triangle in the
   * triangle array. The first node in the array is the root node. Leaf nodes
   * always contain a single triangle.
   *
   * @param rootNode Root node of the BVH tree
   */
  private flattenBVH(rootNode: BVHNode): BVHNodeFlat[] {
    // Flatten tree into a breadth-first array of nodes
    const nodes: BVHNode[] = [];
    const queue: BVHNode[] = [rootNode];
    while (queue.length > 0) {
      const node = queue.shift()!;
      nodes.push(node);
      if (!node.isLeaf) {
        queue.push(node.left);
        queue.push(node.right);
      }
    }

    // Convert references to indices, so we can store the tree in a buffer
    const flatNodes: BVHNodeFlat[] = [];
    for (const node of nodes) {
      flatNodes.push({
        min: node.bbox.min.toArray(),
        max: node.bbox.max.toArray(),
        isLeaf: node.isLeaf ? 1 : 0,
        left: node.isLeaf ? -1 : nodes.indexOf(node.left),
        right: node.isLeaf ? -1 : nodes.indexOf(node.right),
        triangleIndex: node.isLeaf ? node.triangleIndex : -1,
      });
    }

    return flatNodes;
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
  }
}
