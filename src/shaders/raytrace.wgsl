struct Uniforms {
  resolution: vec2f,
  aspect: f32,
  time: f32,
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

struct Sphere {
  center: vec3f,
  radius: f32,
};

struct Hit {
  hit: bool,
  position: vec3f,
  normal: vec3f,
  t: f32,
};

fn raySphereIntersect(ray: Ray, sphere: Sphere) -> Hit {
  let oc = ray.origin - sphere.center;
  let a = dot(ray.direction, ray.direction);
  let b = 2.0 * dot(oc, ray.direction);
  let c = dot(oc, oc) - sphere.radius * sphere.radius;
  let discriminant = b * b - 4.0 * a * c;

  if (discriminant < 0.0) {
    return Hit(false, vec3f(0.0), vec3f(0.0), -1.0);
  }

  let t = (-b - sqrt(discriminant)) / (2.0 * a);
  let position = ray.origin + ray.direction * t;
  let normal = (position - sphere.center) / sphere.radius;

  return Hit(true, position, normal, t);
}

fn cameraToRay(camera: Camera, uv: vec2f) -> Ray {
  let t = tan(radians(camera.fov) / 2.0);
  let r = uniforms.aspect * t;
  let b = -t;
  let l = -r;
  let u = l + (r - l) * uv.x;
  let v = b + (t - b) * uv.y;
  var ray: Ray;
  ray.origin = camera.position;
  ray.direction = normalize(vec3f(u, v, -1.0));
  return ray;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

fn getUv(coord: vec2u) -> vec2f {
  var uv = vec2f(f32(coord.x) / uniforms.resolution.x, f32(coord.y) / uniforms.resolution.y);
  return uv;
}

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  if (globalId.x >= u32(uniforms.resolution.x) || globalId.y >= u32(uniforms.resolution.y)) {
    return;
  }

  let uv = getUv(globalId.xy);

  var color = vec3f(0.0);

  // Scene
  let camera = Camera(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0), 45.0);
  let sphere = Sphere(vec3f(0.0, 0.0, 0.0), 0.2);

  // Ray
  let ray = cameraToRay(camera, uv);

  // Hit
  let hit = raySphereIntersect(ray, sphere);
  if (hit.hit) {
    let lightPosition = vec3f(1.0, 1.0, 1.0);
    let lightDirection = normalize(lightPosition - hit.position);
    let lightIntensity = 1.0;
    let lightColor = vec3f(1.0, 1.0, 1.0);
    let lightAmbient = 0.2;
    let lightDiffuse = max(0.0, dot(hit.normal, lightDirection));
    let lightSpecular = pow(max(0.0, dot(hit.normal, reflect(-lightDirection, hit.normal))), 32.0);
    let light = lightColor * (lightAmbient + lightDiffuse + lightSpecular) * lightIntensity;
    color = light;
  }

  // Debug UVs
  // color = vec3f(uv, 0.0);

  // Debug resolution
  // let hv = vec2f(f32(globalId.x % 2), f32(globalId.y % 2));
  // color = vec3f(1, 0, 1) * hv.x + vec3f(0, 1, 0) * hv.y;

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
