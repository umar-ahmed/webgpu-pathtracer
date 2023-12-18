async function main() {
  if ("gpu" in navigator === false) {
    console.error("WebGPU is not supported.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (adapter === null) {
    console.error("No adapter found.");
    return;
  }

  const device = await adapter.requestDevice();

  const canvas = document.getElementById("webgpu-canvas");

  if (!(canvas instanceof HTMLCanvasElement)) {
    console.error("Canvas not found.");
    return;
  }

  const context = canvas.getContext("webgpu");

  if (context === null) {
    console.error("WebGPU context not found.");
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format });

  const code = /* wgsl */ `
    struct Uniforms {
      resolution: vec2<f32>,
      aspect: f32,
      time: f32,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @vertex
    fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      let pos = array(
        vec2f(-1.0, -1.0),
        vec2f(1.0, -1.0),
        vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0),
        vec2f(1.0, 1.0),
        vec2f(-1.0, 1.0),
      );
      return vec4f(pos[i], 0, 1);
    }

    fn getUv(coord: vec2f) -> vec2f {
      var uv = coord / uniforms.resolution;
      uv.y = 1.0 - uv.y;
      return uv;
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
    fn fragmentMain(@builtin(position) coord: vec4f) -> @location(0) vec4f {
      var uv = getUv(coord.xy);
      
      // Apply a simple animation.
      // uv -= vec2f(0.5 * sin(uniforms.time * 0.5), 0.5 * cos(uniforms.time * 0.5));
      
      // Get the color from the uv coordinates.
      var color = vec3f(uv, 0.0);
      
      // Apply the ACES tonemapping.
      // color = acesTonemap(color);

      return vec4f(color, 1);
    }
  `;

  const uniformsBuffer = device.createBuffer({
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformBindGroupLayout],
    }),
    primitive: {
      topology: "triangle-list",
    },
    vertex: {
      module: device.createShaderModule({ code }),
      entryPoint: "vertexMain",
    },
    fragment: {
      module: device.createShaderModule({ code }),
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
  });

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformsBuffer,
        },
      },
    ],
  });

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    if (!context) {
      return;
    }

    const time = (timestamp - startTime) / 1000;

    const uniformsArray = new Float32Array([
      canvas.width,
      canvas.height,
      canvas.width / canvas.height,
      time,
    ]);

    device.queue.writeBuffer(uniformsBuffer, 0, uniformsArray);

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(6);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(render);
  }

  render(startTime);
}

main().catch((err) => {
  console.error(err);
});
