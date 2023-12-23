struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

struct Uniforms {
  resolution: vec2<f32>,
  aspect: f32,
  time: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var inputTextureSampler: sampler;

@vertex
fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOutput {
  let pos = array(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  let uvs = array(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 1.0),
  );

  var output: VertexOutput;
  output.position = vec4f(pos[i], 0, 1);
  output.uv = uvs[i];

  return output;
}

fn acesTonemap(color: vec3f) -> vec3f {
  let m1 = mat3x3f(
      vec3f(0.59719, 0.07600, 0.02840),
      vec3f(0.35458, 0.90834, 0.13383),
      vec3f(0.04823, 0.01566, 0.83777)
  );
  let m2 = mat3x3f(
      vec3f(1.60475, -0.10208, -0.00327),
      vec3f(-0.53108, 1.10813, -0.07276),
      vec3f(-0.07367, -0.00605, 1.07602)
  );
  let v = m1 * color;
  let a = v * (v + vec3f(0.0245786)) - vec3f(0.000090537);
  let b = v * (vec3f(0.983729) * v + vec3f(0.4329510)) + vec3f(0.238081);
  return pow(clamp(m2 * (a / b), vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Apply a simple animation.
  // uv -= vec2f(0.5 * sin(uniforms.time * 0.5), 0.5 * cos(uniforms.time * 0.5));

  var color: vec3f;

  // Debug the UVs
  color = vec3f(input.uv, 0.0);
  
  // Get the color from the texture.
  color = textureSample(inputTexture, inputTextureSampler, input.uv).rgb;
  
  // Apply the ACES tonemapping.
  // color = acesTonemap(color);

  return vec4f(color, 1);
}