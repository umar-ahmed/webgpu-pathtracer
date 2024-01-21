const SEED = 123456789u;
const PI = 3.14159265359;
const TWOPI = 6.28318530718;
const INVPI = 0.31830988618;
const INVTWOPI = 0.15915494309;
const INF = 1e20;
const EPSILON = 1e-6;
const MAX_STACK_SIZE = 64;

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

struct Hit {
  hit: bool,
  position: vec3f,
  normal: vec3f,
  t: f32,
  materialIndex: i32,
};

struct Material {
  color: vec3f,
  specularColor: vec3f,
  roughness: f32,
  metalness: f32,
  emissionColor: vec3f,
  emissionStrength: f32,
};

struct Triangle {
  aPosition: vec3f,
  bPosition: vec3f,
  cPosition: vec3f,
  aNormal: vec3f,
  bNormal: vec3f,
  cNormal: vec3f,
  materialIndex: i32,
  aabbIndex: i32,
};

struct BVHNode {
  min: vec3f,
  max: vec3f,

  // 0 = leaf, 1 = internal
  isLeaf: i32,

  // If isLeaf is 0, then these are -1
  left: i32,
  right: i32,

  // If isLeaf is 1, then this is -1
  triangleIndex: i32,
};

struct Uniforms {
  resolution: vec2f,
  aspect: f32,
  frame: u32,
  maxBounces: i32,
  samplesPerFrame: i32,
  camera: Camera,
  skyColor: f32,
  sunIntensity: f32,
  sunFocus: f32,
  sunDirection: vec3f,
  skyColorZenith: vec3f,
  skyColorHorizon: vec3f,
  groundColor: vec3f,
};

// Moller-Trumbore algorithm
fn rayTriangleIntersect(ray: Ray, triangle: Triangle) -> Hit {
  var hit = Hit(false, vec3f(0.0), vec3f(0.0), INF, triangle.materialIndex);

  let edge1 = triangle.bPosition - triangle.aPosition;
  let edge2 = triangle.cPosition - triangle.aPosition;
  let h = cross(ray.direction, edge2);
  let a = dot(edge1, h);

  if (a > -EPSILON && a < EPSILON) {
    return hit;
  }

  let f = 1.0 / a;
  let s = ray.origin - triangle.aPosition;
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

fn rayAABBIntersect(ray: Ray, aabbMin: vec3f, aabbMax: vec3f) -> bool {
  let t1 = (aabbMin.x - ray.origin.x) / ray.direction.x;
  let t2 = (aabbMax.x - ray.origin.x) / ray.direction.x;
  let t3 = (aabbMin.y - ray.origin.y) / ray.direction.y;
  let t4 = (aabbMax.y - ray.origin.y) / ray.direction.y;
  let t5 = (aabbMin.z - ray.origin.z) / ray.direction.z;
  let t6 = (aabbMax.z - ray.origin.z) / ray.direction.z;

  let tmin = max(max(min(t1, t2), min(t3, t4)), min(t5, t6));
  let tmax = min(min(max(t1, t2), max(t3, t4)), max(t5, t6));

  return tmax >= max(0.0, tmin);
}

fn rayBVHIntersect(ray: Ray, bvhIndex: i32) -> Hit {
  var hit = Hit(false, vec3f(0.0), vec3f(0.0), INF, -1);

  if (!rayAABBIntersect(ray, bvhBuffer[bvhIndex].min, bvhBuffer[bvhIndex].max)) {
    return hit;
  }

  var stack: array<i32, MAX_STACK_SIZE>;
  var stackSize: i32 = 0;
  stack[stackSize] = bvhIndex;
  stackSize++;

  while (stackSize > 0 && stackSize < MAX_STACK_SIZE) {
    stackSize--;
    let currentNodeIndex = stack[stackSize];
    let currentNode = bvhBuffer[currentNodeIndex];

    if (currentNode.isLeaf == 1) {
      let triangle = triangleBuffer[currentNode.triangleIndex];
      let triangleHit = rayTriangleIntersect(ray, triangle);
      if (triangleHit.hit && triangleHit.t < hit.t) {
        hit = triangleHit;
      }
    } else {
      if (currentNode.left >= 0) {
        let leftNode = bvhBuffer[currentNode.left];
        if (rayAABBIntersect(ray, leftNode.min, leftNode.max)) {
          stack[stackSize] = currentNode.left;
          stackSize++;
        }
      }

      if (currentNode.right >= 0) {
        let rightNode = bvhBuffer[currentNode.right];
        if (rayAABBIntersect(ray, rightNode.min, rightNode.max)) {
          stack[stackSize] = currentNode.right;
          stackSize++;
        }
      }
    }
  }

  return hit;
}

fn raySceneIntersect(ray: Ray) -> Hit {
  if (arrayLength(&bvhBuffer) == 0) {
    return Hit(false, vec3f(0.0), vec3f(0.0), INF, -1);
  } else {
    return rayBVHIntersect(ray, 0);
  }
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

fn trace(seed: ptr<function, u32>, ray: Ray, maxBounces: i32) -> vec3f {
  var traceRay = ray;
  var incomingLight = vec3f(0.0);
  var rayColor = vec3f(1.0);

  for (var i = 0; i < maxBounces; i++) {
    let hit = raySceneIntersect(traceRay);
    if (hit.hit) {
      let material = materialBuffer[hit.materialIndex];

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
      let sunLightDirection = normalize(uniforms.sunDirection);
      let skyGradientT = pow(smoothstep(0.0, 0.4, traceRay.direction.y), 0.35);
      let skyGradient = mix(uniforms.skyColorHorizon, uniforms.skyColorZenith, skyGradientT);
      let sun = pow(max(0, dot(traceRay.direction, sunLightDirection)), uniforms.sunFocus) * uniforms.sunIntensity;
      let groundToSkyT = smoothstep(-0.01, 0, traceRay.direction.y);
      let sunMask = select(0.0, 1.0, groundToSkyT >= 1.0);
      
      incomingLight += rayColor * (mix(uniforms.groundColor, skyGradient, groundToSkyT) + sun * sunMask);
      
      break;
    }
  }

  return incomingLight;
}

@group(0) @binding(0) var<storage, read> triangleBuffer: array<Triangle>;
@group(0) @binding(1) var<storage, read> materialBuffer: array<Material>;
@group(0) @binding(2) var<storage, read> bvhBuffer: array<BVHNode>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
// @group(0) @binding(4) var blueNoiseTexture: texture_2d<f32>;
@group(0) @binding(5) var outputTexture: texture_storage_2d<rgba16float, write>;

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

  // Trace rays
  var incomingLight = vec3f(0.0);

  for (var i = 0; i < uniforms.samplesPerFrame; i++) {
    var ray = cameraToRay(uniforms.camera, uv);

    // Depth of field + Anti-aliasing
    let jitter = vec3f(randPointInCircle(&seed) * (1.0 / uniforms.resolution), 0.0);
    let jitter2 = vec3f(randPointInCircle(&seed) * uniforms.camera.aperture, 0.0);
    let focalPoint = ray.origin + ray.direction * uniforms.camera.focalDistance + jitter;
    ray.origin += jitter2;
    ray.direction = normalize(focalPoint - ray.origin);
   
    // Trace the ray
    incomingLight += trace(&seed, ray, uniforms.maxBounces);
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

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
