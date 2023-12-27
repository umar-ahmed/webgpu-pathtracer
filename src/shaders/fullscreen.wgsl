const PI: f32 = 3.141592653589793;
const INV_PI: f32 = 0.31830988618379067153776752674503;
const INV_SQRT_OF_2PI: f32 = 0.39894228040143267793994605993439;

const TONEMAP_NONE: u32 = 0;
const TONEMAP_ACES: u32 = 1;
const TONEMAP_REINHARD: u32 = 2;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

struct Uniforms {
  resolution: vec2<f32>,
  aspect: f32,
  scalingFactor: f32,
  time: f32,
  denoise: u32,
  tonemapping: u32,
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
  output.uv = uvs[i] * uniforms.scalingFactor;

  return output;
}

// https://github.com/visionary-3d/raytracing-bloom-video/blob/main/src/render/passes/shaders/quad.wgsl
fn denoise(tex: texture_2d<f32>, uv: vec2f, sigma: f32, kSigma: f32, threshold: f32) -> vec4<f32> {
    let radius: f32 = round(kSigma * sigma);
    let radQ: f32 = radius * radius;

    let invSigmaQx2: f32 = 0.5 / (sigma * sigma);
    let invSigmaQx2PI: f32 = INV_PI * invSigmaQx2;

    let invThresholdSqx2: f32 = 0.5 / (threshold * threshold);
    let invThresholdSqrt2PI: f32 = INV_SQRT_OF_2PI / threshold;

    let centrPx: vec4<f32> = textureSample(tex, inputTextureSampler, uv);

    var zBuff: f32 = 0.0;
    var aBuff: vec4<f32> = vec4<f32>(0.0);
    let size: vec2<f32> = uniforms.resolution;

    for (var x: f32 = -radius; x <= radius; x = x + 1.0) {
        let pt: f32 = sqrt(radQ - x * x);
        for (var y: f32 = -pt; y <= pt; y = y + 1.0) {
            let d: vec2<f32> = vec2<f32>(x, y);

            let blurFactor: f32 = exp(-dot(d, d) * invSigmaQx2) * invSigmaQx2PI;

            let walkPx: vec4<f32> = textureSample(tex, inputTextureSampler, uv + d / size);

            let dC: vec4<f32> = walkPx - centrPx;
            let deltaFactor: f32 = exp(-dot(dC, dC) * invThresholdSqx2) * invThresholdSqrt2PI * blurFactor;

            zBuff = zBuff + deltaFactor;
            aBuff = aBuff + deltaFactor * walkPx;
        }
    }
    return aBuff / zBuff;
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

fn reinhardTonemap(color: vec3f) -> vec3f {
  return color / (color + vec3f(1.0));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var color: vec3f;
  
  // Get the color from the texture.
  color = textureSample(inputTexture, inputTextureSampler, input.uv).rgb;

  // Denoise the texture.
  if (uniforms.denoise == 1) {
    color = denoise(inputTexture, input.uv, 5.0, 1.0, 0.08).rgb;
  }
  
  // Apply the tonemapping.
  if (uniforms.tonemapping == TONEMAP_ACES) {
    color = acesTonemap(color);
  } else if (uniforms.tonemapping == TONEMAP_REINHARD) {
    color = reinhardTonemap(color);
  }

  // Debug the UVs
  // color = vec3f(input.uv, 0.0);

  return vec4f(color, 1);
}