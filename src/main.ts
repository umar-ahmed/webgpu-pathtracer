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
    @vertex
    fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      const pos = array(vec2f(0, 1), vec2f(-1, -1), vec2f(1, -1));
      return vec4f(pos[i], 0, 1);
    }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
      return vec4f(1, 0, 0, 1);
    }
  `;

  const module = device.createShaderModule({ code });

  const pipeline = device.createRenderPipeline({
    vertex: {
      module,
      entryPoint: "vertexMain",
    },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    layout: "auto",
  });

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const passEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(3);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
}

main().catch((err) => {
  console.error(err);
});
