@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(1)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;

  let color = vec3f(1.0, 1.0, 0.0);

  textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}
