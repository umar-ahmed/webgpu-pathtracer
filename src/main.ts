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

  const computeShaderCode = /* wgsl */ `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    
    @compute @workgroup_size(1)
    fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
      let i = globalId.x;
      data[i] = data[i] * 2.0;
    }
  `;

  const computeShaderModule = device.createShaderModule({
    code: computeShaderCode,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: computeShaderModule,
      entryPoint: "computeMain",
    },
  });

  const input = new Float32Array([1, 3, 5]);

  const workBuffer = device.createBuffer({
    label: "Work Buffer",
    size: input.byteLength,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(workBuffer, 0, input);

  const resultBuffer = device.createBuffer({
    label: "Result Buffer",
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const computeBindGroup = device.createBindGroup({
    label: "Bind Group for Work Buffer",
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: workBuffer,
        },
      },
    ],
  });

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

  const module = device.createShaderModule({ code });

  const uniformsBuffer = device.createBuffer({
    size:
      2 * 32 + // vec2<f32>
      32 + // f32
      32, // f32
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

  const renderPipeline = await device.createRenderPipelineAsync({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformBindGroupLayout],
    }),
    primitive: {
      topology: "triangle-list",
    },
    vertex: {
      module,
      entryPoint: "vertexMain",
    },
    fragment: {
      module,
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

    // Compute pass
    const computePassEncoder = commandEncoder.beginComputePass({
      label: "Compute Pass",
    });
    computePassEncoder.setPipeline(computePipeline);
    computePassEncoder.setBindGroup(0, computeBindGroup);
    computePassEncoder.dispatchWorkgroups(input.length);
    computePassEncoder.end();

    commandEncoder.copyBufferToBuffer(
      workBuffer,
      0,
      resultBuffer,
      0,
      resultBuffer.size
    );

    // Render pass
    const renderPassEncoder = commandEncoder.beginRenderPass({
      label: "Render Pass",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPassEncoder.setPipeline(renderPipeline);
    renderPassEncoder.setBindGroup(0, uniformBindGroup);
    renderPassEncoder.draw(6);
    renderPassEncoder.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // requestAnimationFrame(render);
  }

  render(startTime);

  // Read the result
  await resultBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(resultBuffer.getMappedRange());

  console.table(
    [
      { input: input[0], result: result[0] },
      { input: input[1], result: result[1] },
      { input: input[2], result: result[2] },
    ],
    ["input", "result"]
  );

  resultBuffer.unmap();

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement;
      const width = entry.contentBoxSize[0].inlineSize;
      const height = entry.contentBoxSize[0].blockSize;
      canvas.width = width;
      canvas.height = height;
      render(performance.now());
    }
  });

  observer.observe(canvas);
}

main().catch((err) => {
  console.error(err);
});
