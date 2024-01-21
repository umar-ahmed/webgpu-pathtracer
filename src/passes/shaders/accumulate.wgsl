struct Uniforms {
  resolution: vec2u,
  frame: u32,
  enabled: u32,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexturePrev: texture_2d<f32>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  if (globalId.x >= u32(uniforms.resolution.x) || globalId.y >= u32(uniforms.resolution.y)) {
    return;
  }
  
  let color =  textureLoad(inputTexture, globalId.xy, 0).rgb;
  let prevColor = textureLoad(outputTexturePrev, globalId.xy, 0).rgb;
  var weight = 1.0 / f32(uniforms.frame);
  if (uniforms.enabled == 0) {
    weight = 1.0;
  }
  let newColor = mix(prevColor, color, weight);

  textureStore(outputTexture, globalId.xy, vec4f(newColor, 1.0));
}