struct Uniforms {
  resolution: vec2<f32>,
  aspect: f32,
  time: f32,
};

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

  // Debug UVs
  var color = vec3f(uv, 0.0);

  // Moire pattern
  let hv = vec2f(f32(globalId.x % 2), f32(globalId.y % 2));
  color = vec3f(1, 0, 1) * hv.x + vec3f(0, 1, 0) * hv.y;

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
