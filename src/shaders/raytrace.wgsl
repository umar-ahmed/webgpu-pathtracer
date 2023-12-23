const PI = 3.1415926535897932384626433832795;

struct Uniforms {
  resolution: vec2f,
  aspect: f32,
  time: f32,
  frame: u32,
};

struct Camera {
  position: vec3f,
  direction: vec3f,
  fov: f32,
};

struct Ray {
  origin: vec3f,
  direction: vec3f,
};

struct Material {
  color: vec3f,
  emissionColor: vec3f,
  emissionStrength: f32,
};

struct Sphere {
  center: vec3f,
  radius: f32,
  material: Material,
};

struct Hit {
  hit: bool,
  position: vec3f,
  normal: vec3f,
  t: f32,
  material: Material,
};

fn raySphereIntersect(ray: Ray, sphere: Sphere) -> Hit {
  var hit = Hit(false, vec3f(0.0), vec3f(0.0), -1.0, sphere.material);

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

fn raySceneIntersect(ray: Ray, scene: array<Sphere, 5>) -> Hit {
  var closestHit: Hit;
  closestHit.hit = false;
  closestHit.t = -1.0;

  for (var i = 0; i < 5; i++) {
    let sphere = scene[i];
    let hit = raySphereIntersect(ray, sphere);
    if (hit.hit && (hit.t < closestHit.t || closestHit.hit == false)) {
      closestHit = hit;
    }
  }

  return closestHit;
}

fn cameraToRay(camera: Camera, uv: vec2f) -> Ray {
  let t = tan(radians(camera.fov) / 2.0);
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
  let theta = 2.0 * PI * rand(seed);
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

fn trace(seed: ptr<function, u32>, ray: Ray, scene: array<Sphere, 5>, maxBounces: i32) -> vec3f {
  var traceRay = ray;
  
  var incomingLight = vec3f(0.0);
  var rayColor = vec3f(1.0);

  for (var i = 0; i < maxBounces; i++) {
    let hit = raySceneIntersect(traceRay, scene);
    if (hit.hit) {
      traceRay.origin = hit.position;
      traceRay.direction = randHemisphere(seed, hit.normal);

      let emittedLight = hit.material.emissionColor * hit.material.emissionStrength;
      incomingLight += emittedLight * rayColor;
      rayColor *= hit.material.color;
    } else {
      break;
    }
  }

  return incomingLight;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  if (globalId.x >= u32(uniforms.resolution.x) || globalId.y >= u32(uniforms.resolution.y)) {
    return;
  }
  
  var color = vec3f(0.0);

  // Calculate UV coordinates
  let uv = getUv(globalId.xy);

  // Random seed
  let index = u32(globalId.x) + u32(globalId.y) * u32(uniforms.resolution.x);
  var seed = index + uniforms.frame * 719393u;

  // Camera
  let camera = Camera(vec3f(0.0, 0.4, -2.0), vec3f(0.0, -0.2, 1.0), 45.0);
  
  // Scene
  let scene = array<Sphere, 5>(
    // Subject
    Sphere(vec3f(-0.45, 0.0, 0.0), 0.2, Material(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 0.0), 0.0)),
    Sphere(vec3f(0.0, 0.0, 0.0), 0.2, Material(vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.0, 0.0), 0.0)),
    Sphere(vec3f(0.45, 0.0, 0.0), 0.2, Material(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, 0.0), 0.0)),
    // Floor
    Sphere(vec3f(0.0, -30.2, 0.0), 30.0, Material(vec3f(0.5, 0.5, 0.5), vec3f(0.0, 0.0, 0.0), 0.0)),
    // Light
    Sphere(vec3f(4.0, 3.5, 10.0), 5.0, Material(vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0), 4.0))
  );

  // Ray
  var ray = cameraToRay(camera, uv);

  // Hit
  let maxBounces = 4;
  let raysPerPixel = 10;
  var incomingLight = vec3f(0.0);

  for (var i = 0; i < raysPerPixel; i++) {
    incomingLight += trace(&seed, ray, scene, maxBounces);
  }

  color = incomingLight / f32(raysPerPixel);

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
