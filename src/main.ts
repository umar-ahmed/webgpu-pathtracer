import { FullscreenPass } from "./FullscreenPass";
import { RaytracingPass } from "./RaytracingPass";
import { Renderer } from "./Renderer";

async function main() {
  const supported = await Renderer.supported();

  if (!supported) {
    console.error("WebGPU is not supported.");
    return;
  }

  const renderer = await Renderer.create();

  document.body.appendChild(renderer.canvas);

  const raytracingPass = new RaytracingPass(renderer);
  const fullscreenPass = new FullscreenPass(renderer);

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    // Update uniforms
    const time = (timestamp - startTime) / 1000;
    fullscreenPass.update({ time });

    // Render
    const commandEncoder = renderer.device.createCommandEncoder();

    raytracingPass.render(commandEncoder);
    fullscreenPass.render(commandEncoder);

    const commandBuffer = commandEncoder.finish();
    renderer.device.queue.submit([commandBuffer]);
  }

  render(startTime);

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
