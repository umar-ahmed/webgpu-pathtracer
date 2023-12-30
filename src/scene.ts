export class Vector3 {
  constructor(public x: number, public y: number, public z: number) {}

  toArray() {
    return [this.x, this.y, this.z];
  }

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

  applyQuaternion(rotation: Quaternion) {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    const qx = rotation.x;
    const qy = rotation.y;
    const qz = rotation.z;
    const qw = rotation.w;

    // calculate quat * vector

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat

    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

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

  traverse(callback: (object: Object3D) => void) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }
}

export class Scene extends Object3D {}

export class Camera extends Object3D {
  private _direction = new Vector3(0, 0, 1);
  public up = new Vector3(0, 1, 0);
  private _right = new Vector3(1, 0, 0);

  constructor(
    public fov: number,
    public focalDistance: number,
    public aperture: number
  ) {
    super();
  }

  get direction() {
    return this._direction.clone().applyQuaternion(this.rotation);
  }

  get right() {
    return this._right.clone().applyQuaternion(this.rotation);
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

  static createPlane(x: number, y: number) {
    const vertices = [
      new Vector3(-x, -y, 0),
      new Vector3(x, -y, 0),
      new Vector3(x, y, 0),
      new Vector3(-x, -y, 0),
      new Vector3(x, y, 0),
      new Vector3(-x, y, 0),
    ];

    const normals = [
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
      new Vector3(0, 0, -1),
    ];

    return new Geometry(vertices, normals);
  }

  static createSphere(
    radius: number,
    widthSegments: number,
    heightSegments: number
  ) {
    widthSegments = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));

    const vertices: Vector3[] = [];
    const normals: Vector3[] = [];

    // Generate vertices and normals for each triangle
    for (let y = 0; y <= heightSegments; y++) {
      for (let x = 0; x <= widthSegments; x++) {
        // Generate two triangles per segment
        const u0 = x / widthSegments;
        const v0 = y / heightSegments;
        const u1 = x === widthSegments ? 0 : (x + 1) / widthSegments;
        const v1 = y === heightSegments ? 0 : (y + 1) / heightSegments;

        const theta0 = u0 * Math.PI * 2;
        const phi0 = v0 * Math.PI;
        const theta1 = u1 * Math.PI * 2;
        const phi1 = v1 * Math.PI;

        vertices.push(
          new Vector3(
            radius * Math.sin(phi0) * Math.cos(theta0),
            radius * Math.cos(phi0),
            radius * Math.sin(phi0) * Math.sin(theta0)
          ),
          new Vector3(
            radius * Math.sin(phi0) * Math.cos(theta1),
            radius * Math.cos(phi0),
            radius * Math.sin(phi0) * Math.sin(theta1)
          ),
          new Vector3(
            radius * Math.sin(phi1) * Math.cos(theta1),
            radius * Math.cos(phi1),
            radius * Math.sin(phi1) * Math.sin(theta1)
          ),
          new Vector3(
            radius * Math.sin(phi0) * Math.cos(theta0),
            radius * Math.cos(phi0),
            radius * Math.sin(phi0) * Math.sin(theta0)
          ),
          new Vector3(
            radius * Math.sin(phi1) * Math.cos(theta1),
            radius * Math.cos(phi1),
            radius * Math.sin(phi1) * Math.sin(theta1)
          ),
          new Vector3(
            radius * Math.sin(phi1) * Math.cos(theta0),
            radius * Math.cos(phi1),
            radius * Math.sin(phi1) * Math.sin(theta0)
          )
        );

        normals.push(
          new Vector3(
            Math.sin(phi0) * Math.cos(theta0),
            Math.cos(phi0),
            Math.sin(phi0) * Math.sin(theta0)
          ),
          new Vector3(
            Math.sin(phi0) * Math.cos(theta1),
            Math.cos(phi0),
            Math.sin(phi0) * Math.sin(theta1)
          ),
          new Vector3(
            Math.sin(phi1) * Math.cos(theta1),
            Math.cos(phi1),
            Math.sin(phi1) * Math.sin(theta1)
          ),
          new Vector3(
            Math.sin(phi0) * Math.cos(theta0),
            Math.cos(phi0),
            Math.sin(phi0) * Math.sin(theta0)
          ),
          new Vector3(
            Math.sin(phi1) * Math.cos(theta1),
            Math.cos(phi1),
            Math.sin(phi1) * Math.sin(theta1)
          ),
          new Vector3(
            Math.sin(phi1) * Math.cos(theta0),
            Math.cos(phi1),
            Math.sin(phi1) * Math.sin(theta0)
          )
        );
      }
    }

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

  set(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  toArray() {
    return [this.r, this.g, this.b];
  }
}

export class Material {
  public color: Color = new Color(1, 1, 1);
  public specularColor: Color = new Color(1, 1, 1);
  public emissionColor: Color = new Color(0, 0, 0);
  public emissionStrength: number = 0.0;
  public roughness: number = 0.0;
  public metalness: number = 0.0;
}

export class Mesh extends Object3D {
  constructor(public geometry: Geometry, public material: Material) {
    super();
  }
}
