import { FullscreenPass } from "./FullscreenPass";
import { RaytracingPass } from "./RaytracingPass";
import { Renderer } from "./Renderer";

async function main() {
  const supported = await Renderer.supported();

  if (!supported) {
    console.error("WebGPU is not supported.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!device) {
    console.error("WebGPU device not found.");
    return;
  }

  const renderer = new Renderer(device);
  document.body.appendChild(renderer.canvas);

  const input = new Float32Array([1, 3, 5]);
  const raytracingPass = new RaytracingPass(renderer, input);

  const resultBuffer = device.createBuffer({
    label: "Result Buffer",
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const fullscreenPass = new FullscreenPass(renderer);

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    if (!device) {
      console.error("WebGPU device not found.");
      return;
    }

    const time = (timestamp - startTime) / 1000;

    fullscreenPass.update({ time });

    const commandEncoder = device.createCommandEncoder();

    // Compute pass
    raytracingPass.render(commandEncoder);

    // Copy pass
    commandEncoder.copyBufferToBuffer(
      raytracingPass.workBuffer,
      0,
      resultBuffer,
      0,
      resultBuffer.size
    );

    // Render pass
    fullscreenPass.render(commandEncoder);

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
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

  const observer = new ResizeObserver(([entry]) => {
    const width = entry.contentBoxSize[0].inlineSize;
    const height = entry.contentBoxSize[0].blockSize;
    renderer.setSize(width, height);

    render(performance.now());
  });

  observer.observe(renderer.canvas);
}

main().catch((err) => {
  console.error(err);
});
