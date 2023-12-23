struct Uniforms {
  resolution: vec2f,
  aspect: f32,
  time: f32,
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
  let sphere = Sphere(vec3f(0.0, 0.0, 0.0), 0.3);

  // Camera Ray (perspective)
  var ray: Ray;
  ray.origin = vec3f(0.0, 0.0, -1.0);
  
  let viewportHeight = 2.0;
  let viewportWidth = viewportHeight / uniforms.aspect;
  let focalLength = 1.0;
  let horizontal = vec3f(viewportWidth, 0.0, 0.0);
  let vertical = vec3f(0.0, viewportHeight, 0.0);
  let lowerLeftCorner = ray.origin - horizontal / 2.0 - vertical / 2.0 - vec3f(0.0, 0.0, focalLength);

  ray.direction = lowerLeftCorner + horizontal * uv.x + vertical * uv.y - ray.origin;

  // Hit
  let hit = raySphereIntersect(ray, sphere);

  if (hit.hit) {
    // Diffuse shading
    let normal = hit.normal;
    let lightDir = normalize(vec3f(-1.0, 1.0, 1.0));
    let lightIntensity = 1.0;
    let ambientLightIntensity = 0.1;
    let diffuse = max(dot(normal, lightDir), 0.0) * lightIntensity + ambientLightIntensity;
    color = vec3f(diffuse);
  }

  // Debug UVs
  // color = vec3f(uv, 0.0);

  // Debug resolution
  // let hv = vec2f(f32(globalId.x % 2), f32(globalId.y % 2));
  // color = vec3f(1, 0, 1) * hv.x + vec3f(0, 1, 0) * hv.y;

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
