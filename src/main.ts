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

    @fragment
    fn fragmentMain(@builtin(position) coord: vec4f) -> @location(0) vec4f {
      var uv = getUv(coord.xy);
      // Rotate the uv coordinates by time around the center of the screen.
      uv -= vec2f(0.5 * sin(uniforms.time));
      // Get the color from the uv coordinates.
      let color = vec3f(uv, 1.0);
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
