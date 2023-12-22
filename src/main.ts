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
    raytracingPass.update({ time });
    fullscreenPass.update({ time });

    // Render
    const commandEncoder = renderer.device.createCommandEncoder();

    raytracingPass.render(commandEncoder);
    fullscreenPass.render(commandEncoder);

    const commandBuffer = commandEncoder.finish();
    renderer.device.queue.submit([commandBuffer]);
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const observer = new ResizeObserver(([entry]) => {
    const dpr = clamp(window.devicePixelRatio, 1, 2);
    const maxDimension = renderer.device.limits.maxTextureDimension2D;
    const width = clamp(
      entry.devicePixelContentBoxSize?.[0].inlineSize ||
        entry.contentBoxSize[0].inlineSize * dpr,
      1,
      maxDimension
    );
    const height = clamp(
      entry.devicePixelContentBoxSize?.[0].blockSize ||
        entry.contentBoxSize[0].blockSize * dpr,
      1,
      maxDimension
    );

    renderer.resize(width, height);
    raytracingPass.resize();
    fullscreenPass.resize();

    render(performance.now());
  });

  try {
    observer.observe(renderer.canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(renderer.canvas, { box: "content-box" });
  }
}

main().catch((err) => {
  console.error(err);
});
