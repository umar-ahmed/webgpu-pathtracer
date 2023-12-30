export class Vector3 {
  constructor(public x: number, public y: number, public z: number) {}

  copy(vector: Vector3) {
    this.x = vector.x;
    this.y = vector.y;
    this.z = vector.z;
    return this;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  add(vector: Vector3) {
    this.x += vector.x;
    this.y += vector.y;
    this.z += vector.z;
    return this;
  }

  sub(vector: Vector3) {
    this.x -= vector.x;
    this.y -= vector.y;
    this.z -= vector.z;
    return this;
  }

  multiply(vector: Vector3) {
    this.x *= vector.x;
    this.y *= vector.y;
    this.z *= vector.z;
    return this;
  }

  divide(vector: Vector3) {
    this.x /= vector.x;
    this.y /= vector.y;
    this.z /= vector.z;
    return this;
  }

  multiplyScalar(scalar: number) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize() {
    return this.multiplyScalar(1 / this.length());
  }

  dot(vector: Vector3) {
    return this.x * vector.x + this.y * vector.y + this.z * vector.z;
  }

  cross(vector: Vector3) {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.x = y * vector.z - z * vector.y;
    this.y = z * vector.x - x * vector.z;
    this.z = x * vector.y - y * vector.x;

    return this;
  }

  reflect(normal: Vector3) {
    return this.sub(normal.clone().multiplyScalar(2 * this.dot(normal)));
  }

  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  lerp(vector: Vector3, alpha: number) {
    this.x += (vector.x - this.x) * alpha;
    this.y += (vector.y - this.y) * alpha;
    this.z += (vector.z - this.z) * alpha;
    return this;
  }
}

export class Matrix4 {
  elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export class Quaternion {
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public w: number
  ) {}
}

export class Object3D {
  public position = new Vector3(0, 0, 0);
  public rotation = new Quaternion(0, 0, 0, 1);
  public scale = new Vector3(1, 1, 1);
  public children: Object3D[] = [];
  public parent: Object3D | null = null;
  public matrix = new Matrix4();

  add(...children: Object3D[]) {
    for (const child of children) {
      this.children.push(child);
      child.parent = this;
    }
  }

  remove(...children: Object3D[]) {
    for (const child of children) {
      const index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
        child.parent = null;
      }
    }
  }

  traverse(callback: (object: Object3D) => boolean) {
    if (callback(this)) {
      return;
    }
    for (const child of this.children) {
      child.traverse(callback);
    }
  }
}

export class Scene extends Object3D {}

export class Camera extends Object3D {
  public direction = new Vector3(0, 0, -1);
  public up = new Vector3(0, 1, 0);
  public right = new Vector3(1, 0, 0);

  constructor(
    public fov: number,
    public focalDistance: number,
    public aperture: number
  ) {
    super();
  }
}

export class Geometry {
  constructor(public vertices: Vector3[], public normals: Vector3[]) {}

  static createBox(x: number, y: number, z: number) {
    const vertices = [
      // front 1
      new Vector3(-x, -y, z),
      new Vector3(x, -y, z),
      new Vector3(x, y, z),
      // front 2
      new Vector3(-x, -y, z),
      new Vector3(x, y, z),
      new Vector3(-x, y, z),
      // right 1
      new Vector3(x, -y, z),
      new Vector3(x, -y, -z),
      new Vector3(x, y, -z),
      // right 2
      new Vector3(x, -y, z),
      new Vector3(x, y, -z),
      new Vector3(x, y, z),
      // back 1
      new Vector3(x, -y, -z),
      new Vector3(-x, -y, -z),
      new Vector3(-x, y, -z),
      // back 2
      new Vector3(x, -y, -z),
      new Vector3(-x, y, -z),
      new Vector3(x, y, -z),
      // left 1
      new Vector3(-x, -y, -z),
      new Vector3(-x, -y, z),
      new Vector3(-x, y, z),
      // left 2
      new Vector3(-x, -y, -z),
      new Vector3(-x, y, z),
      new Vector3(-x, y, -z),
      // top 1
      new Vector3(-x, y, z),
      new Vector3(x, y, z),
      new Vector3(x, y, -z),
      // top 2
      new Vector3(-x, y, z),
      new Vector3(x, y, -z),
      new Vector3(-x, y, -z),
      // bottom 1
      new Vector3(-x, -y, -z),
      new Vector3(x, -y, -z),
      new Vector3(x, -y, z),
      // bottom 2
      new Vector3(-x, -y, -z),
      new Vector3(x, -y, z),
      new Vector3(-x, -y, z),
    ];

    const normals = [
      // front 1
      new Vector3(0, 0, 1),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, 1),
      // front 2
      new Vector3(0, 0, 1),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, 1),
      // right 1
      new Vector3(1, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(1, 0, 0),
      // right 2
      new Vector3(1, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(1, 0, 0),
      // back 1
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      // back 2
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      // left 1
      new Vector3(-1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(-1, 0, 0),
      // left 2
      new Vector3(-1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(-1, 0, 0),
      // top 1
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      // top 2
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      // bottom 1
      new Vector3(0, -1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, -1, 0),
      // bottom 2
      new Vector3(0, -1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, -1, 0),
    ];

    return new Geometry(vertices, normals);
  }
}

export class Color {
  constructor(public r: number, public g: number, public b: number) {}

  copy(color: Color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }

  clone() {
    return new Color(this.r, this.g, this.b);
  }
}

export class Material {
  public color: Color = new Color(1, 1, 1);
  public specularColor: Color = new Color(1, 1, 1);
  public emissiveColor: Color = new Color(0, 0, 0);
  public emission: number = 0.0;
  public roughness: number = 0.0;
  public metalness: number = 0.0;
}

export class Mesh extends Object3D {
  constructor(public geometry: Geometry, public material: Material) {
    super();
  }
}
