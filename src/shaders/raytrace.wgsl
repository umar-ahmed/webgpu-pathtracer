const SEED = 123456789u;
const PI = 3.14159265359;
const TWOPI = 6.28318530718;
const INVPI = 0.31830988618;
const INVTWOPI = 0.15915494309;
const INF = 1e20;
const EPSILON = 1e-6;

struct Camera {
  position: vec3f,
  direction: vec3f,
  fov: f32,
  focalDistance: f32,
  aperture: f32,
};

struct Ray {
  origin: vec3f,
  direction: vec3f,
};

struct Material {
  color: vec3f,
  specularColor: vec3f,
  roughness: f32,
  metalness: f32,
  emissionColor: vec3f,
  emissionStrength: f32,
};

struct Sphere {
  center: vec3f,
  radius: f32,
  materialIndex: i32,
};

struct Triangle {
  a: vec3f,
  b: vec3f,
  c: vec3f,
  aNormal: vec3f,
  bNormal: vec3f,
  cNormal: vec3f,
  materialIndex: i32,
};

struct Scene {
  numTriangles: i32,
  numSpheres: i32,
  numMaterials: i32,
  triangles: array<Triangle, 12>,
  spheres: array<Sphere, 4>,
  materials: array<Material, 7>,
};

struct Hit {
  hit: bool,
  position: vec3f,
  normal: vec3f,
  t: f32,
  materialIndex: i32,
};

struct Uniforms {
  resolution: vec2f,
  aspect: f32,
  time: f32,
  frame: u32,
  maxBounces: i32,
  samplesPerFrame: i32,
  camera: Camera,
  color: vec3f,
};


fn raySphereIntersect(ray: Ray, sphere: Sphere) -> Hit {
  var hit = Hit(false, vec3f(0.0), vec3f(0.0), INF, sphere.materialIndex);

  let oc = ray.origin - sphere.center;
  let a = dot(ray.direction, ray.direction);
  let b = 2.0 * dot(oc, ray.direction);
  let c = dot(oc, oc) - sphere.radius * sphere.radius;
  let discriminant = b * b - 4.0 * a * c;

  if (discriminant >= 0.0) {
    var t = (-b - sqrt(discriminant)) / (2.0 * a);

    if (t >= 0.0) {
      hit.hit = true;
      hit.position = ray.origin + t * ray.direction;
      hit.normal = normalize(hit.position - sphere.center);
      hit.t = t;
    }
  }

  return hit;
}

// Moller-Trumbore algorithm
fn rayTriangleIntersect(ray: Ray, triangle: Triangle) -> Hit {
  var hit = Hit(false, vec3f(0.0), vec3f(0.0), INF, triangle.materialIndex);

  let edge1 = triangle.b - triangle.a;
  let edge2 = triangle.c - triangle.a;
  let h = cross(ray.direction, edge2);
  let a = dot(edge1, h);

  if (a > -EPSILON && a < EPSILON) {
    return hit;
  }

  let f = 1.0 / a;
  let s = ray.origin - triangle.a;
  let u = f * dot(s, h);

  if (u < 0.0 || u > 1.0) {
    return hit;
  }

  let q = cross(s, edge1);
  let v = f * dot(ray.direction, q);

  if (v < 0.0 || u + v > 1.0) {
    return hit;
  }

  let w = 1.0 - u - v;
  let t = f * dot(edge2, q);

  if (t > EPSILON) {
    hit.hit = true;
    hit.t = t;
    hit.position = ray.origin + t * ray.direction;
    hit.normal = normalize(triangle.aNormal * w + triangle.bNormal * u + triangle.cNormal * v);
  }

  return hit;
}
  

fn raySceneIntersect(ray: Ray, scene: Scene) -> Hit {
  var closestHit: Hit;
  closestHit.hit = false;
  closestHit.t = INF;

  for (var i = 0; i < scene.numTriangles; i++) {
    let triangle = scene.triangles[i];
    let hit = rayTriangleIntersect(ray, triangle);
    if (hit.hit && hit.t < closestHit.t) {
      closestHit = hit;
    }
  }

  for (var i = 0; i < scene.numSpheres; i++) {
    let sphere = scene.spheres[i];
    let hit = raySphereIntersect(ray, sphere);
    if (hit.hit && hit.t < closestHit.t) {
      closestHit = hit;
    }
  }

  return closestHit;
}

fn degToRad(degrees: f32) -> f32 {
  return degrees * 3.14159265358979323846264338327950288 / 180.0;
}

fn cameraToRay(camera: Camera, uv: vec2f) -> Ray {
  let t = tan(degToRad(camera.fov) / 2.0);
  let r = uniforms.aspect * t;
  let b = -t;
  let l = -r;
  let u = l + (r - l) * uv.x;
  let v = b + (t - b) * uv.y;

  // Construct a coordinate system from the camera's direction
  let w = normalize(-camera.direction);
  let u_dir = normalize(cross(vec3f(0.0, 1.0, 0.0), w));
  let v_dir = cross(w, u_dir);

  // Rotate the ray direction by the camera's orientation
  let direction = normalize(u_dir * u + v_dir * v - w * uniforms.aspect);

  var ray: Ray;
  ray.origin = camera.position;
  ray.direction = direction;
  
  return ray;
}

fn getUv(coord: vec2u) -> vec2f {
  var uv = vec2f(f32(coord.x) / uniforms.resolution.x, f32(coord.y) / uniforms.resolution.y);
  return uv;
}

// Random functions based on Sebastian Lague's video: https://www.youtube.com/watch?v=Qz0KTGYJtUk
fn rand(seed: ptr<function, u32>) -> f32 {
  (*seed) = (*seed) * 747796405u + 2891336453u;
  let newSeed = *seed;
  var result: u32 = ((newSeed >> ((newSeed >> 28u) + 4u)) ^ newSeed) * 277803737u;
  result = (result >> 22u) ^ result;
  return f32(result) / 4294967295.0;
}

fn randNormal(seed: ptr<function, u32>) -> f32 {
  let theta = TWOPI * rand(seed);
  let rho = sqrt(-2.0 * log(rand(seed)));
  return rho * cos(theta);
}

fn randDirection(seed: ptr<function, u32>) -> vec3f {
  let x = randNormal(seed);
  let y = randNormal(seed);
  let z = randNormal(seed);
  return normalize(vec3f(x, y, z));
}

fn randHemisphere(seed: ptr<function, u32>, normal: vec3f) -> vec3f {
  let direction = randDirection(seed);
  return direction * sign(dot(direction, normal));
}

fn randCosineWeightedHemisphere(seed: ptr<function, u32>, normal: vec3f) -> vec3f {
  return normalize(normal + randDirection(seed));
}

fn randPointInCircle(seed: ptr<function, u32>) -> vec2f {
  let theta = TWOPI * rand(seed);
  let rho = sqrt(rand(seed));
  return vec2f(rho * cos(theta), rho * sin(theta));
}

fn trace(seed: ptr<function, u32>, ray: Ray, scene: Scene, maxBounces: i32) -> vec3f {
  var traceRay = ray;
  var incomingLight = vec3f(0.0);
  var rayColor = vec3f(1.0);

  for (var i = 0; i < maxBounces; i++) {
    let hit = raySceneIntersect(traceRay, scene);
    if (hit.hit) {
      let material = scene.materials[hit.materialIndex];

      let diffuseDirection = randCosineWeightedHemisphere(seed, hit.normal);
      let specularDirection = reflect(traceRay.direction, hit.normal);
      var isSpecularBounce = 0.0;
      if (material.metalness >= rand(seed)) {
        isSpecularBounce = 1.0;
      }
      
      // Calculate ray direction based on material properties
      traceRay.origin = hit.position;
      traceRay.direction = mix(diffuseDirection, specularDirection, isSpecularBounce * (1.0 - material.roughness));

      let emittedLight = material.emissionColor * material.emissionStrength;
      incomingLight += emittedLight * rayColor;
      rayColor *= mix(material.color, material.specularColor, isSpecularBounce);
    } else {
      break;
    }
  }

  return incomingLight;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var blueNoiseTexture: texture_2d<f32>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var outputTexturePrev: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  if (globalId.x >= u32(uniforms.resolution.x) || globalId.y >= u32(uniforms.resolution.y)) {
    return;
  }
  
  var color = vec3f(0.0);

  // Calculate UV coordinates
  let uv = getUv(globalId.xy);

  // Random seed
  let index = globalId.x + globalId.y * u32(uniforms.resolution.x);
  var seed = index + uniforms.frame * 719393u + SEED;

  // Scene
  let floor = Material(vec3f(0.5, 0.5, 0.5), vec3f(1.0, 1.0, 1.0), 1.0, 0.01, vec3f(0.0, 0.0, 0.0), 0.0);
  let light = Material(vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0), 1.0, 0.0, vec3f(1.0, 1.0, 1.0), 4.0);
  let metal = Material(uniforms.color, vec3f(1.0, 1.0, 1.0), 0.0, 0.99, vec3f(0.0, 0.0, 0.0), 0.0);
  let roughDiffuse = Material(uniforms.color, vec3f(1.0, 1.0, 1.0), 1.0, 0.02, vec3f(0.0, 0.0, 0.0), 0.0);
  let smoothDiffuse = Material(uniforms.color, vec3f(1.0, 1.0, 1.0), 0.0, 0.03, vec3f(0.0, 0.0, 0.0), 0.0);
  let red = Material(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0), 1.0, 0.0, vec3f(0.0, 0.0, 0.0), 0.0);
  let green = Material(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 1.0, 1.0), 1.0, 0.0, vec3f(0.0, 0.0, 0.0), 0.0);

  let a = vec3f(3.0, 0.0, 3.0);
  let b = vec3f(3.0, 0.0, -3.0);
  let c = vec3f(-3.0, 0.0, -3.0);
  let d = vec3f(-3.0, 0.0, 3.0);

  let e = vec3f(3.0, 6.0, 3.0);
  let f = vec3f(3.0, 6.0, -3.0);
  let g = vec3f(-3.0, 6.0, -3.0);
  let h = vec3f(-3.0, 6.0, 3.0);
  
  let px = vec3f(1.0, 0.0, 0.0);
  let nx = vec3f(-1.0, 0.0, 0.0);
  let py = vec3f(0.0, 1.0, 0.0);
  let ny = vec3f(0.0, -1.0, 0.0);
  let pz = vec3f(0.0, 0.0, 1.0);
  let nz = vec3f(0.0, 0.0, -1.0);

  let scene = Scene(
    12, 4, 7,
    array<Triangle, 12>(
      // Bottom
      Triangle(a, b, c, py, py, py, 0),
      Triangle(a, c, d, py, py, py, 0),
      
      // Left
      Triangle(a, b, e, nx, nx, nx, 5),
      Triangle(b, f, e, nx, nx, nx, 5),

      // Front
      Triangle(b, c, f, pz, pz, pz, 0),
      Triangle(c, g, f, pz, pz, pz, 0),

      // Right
      Triangle(c, d, g, px, px, px, 6),
      Triangle(d, h, g, px, px, px, 6),
      
      // Back
      Triangle(d, a, h, nz, nz, nz, 0),
      Triangle(a, e, h, nz, nz, nz, 0),
      
      // Top
      Triangle(e, f, g, ny, ny, ny, 0),
      Triangle(e, g, h, ny, ny, ny, 0)
    ),
    array<Sphere, 4>(
      // Subject
      Sphere(vec3f(-0.45, 0.2, 0.0), 0.2, 4),
      Sphere(vec3f(0.0, 0.4, 0.8), 0.4, 3),
      Sphere(vec3f(0.45, 0.2, 0.0), 0.2, 2),
      // Light
      Sphere(vec3f(0.0, 4.5, 0.0), 1.5, 1)
    ),
    array<Material, 7>(
      floor,
      light,
      metal,
      roughDiffuse,
      smoothDiffuse,
      red,
      green
    )
  );

  // Trace rays
  var incomingLight = vec3f(0.0);

  for (var i = 0; i < uniforms.samplesPerFrame; i++) {
    var ray = cameraToRay(uniforms.camera, uv);

    // Depth of field + Anti-aliasing
    let jitter = vec3f(randPointInCircle(&seed) * (1.0 / uniforms.resolution), 0.0);
    let fovAdjustedAperture = uniforms.camera.aperture / tan(degToRad(uniforms.camera.fov) * 0.5);
    let jitter2 = vec3f(randPointInCircle(&seed) * fovAdjustedAperture, 0.0);
    let focalPoint = ray.origin + ray.direction * uniforms.camera.focalDistance + jitter;
    ray.origin += jitter2;
    ray.direction = normalize(focalPoint - ray.origin);
   
    // Trace the ray
    incomingLight += trace(&seed, ray, scene, uniforms.maxBounces);
  }

  color = incomingLight / f32(uniforms.samplesPerFrame);

  // Debug UVs
  // color = vec3f(uv, 0.0);

  // Debug resolution
  // let hv = vec2f(f32(globalId.x % 2), f32(globalId.y % 2));
  // color = vec3f(1, 0, 1) * hv.x + vec3f(0, 1, 0) * hv.y;

  // Debug ray
  // color = vec3f(ray.direction);

  // Debug RNG
  // color = vec3f(rand(&seed));
  // color = vec3f(randNormal(&seed));
  // color = randDirection(&seed);
  // color = randHemisphere(&seed, vec3f(0.0, 1.0, 0.0));

  // Temporal accumulation
  let prevColor = textureLoad(outputTexturePrev, globalId.xy, 0).rgb;
  let weight = 1.0 / f32(uniforms.frame);
  color = mix(prevColor, color, weight);

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
