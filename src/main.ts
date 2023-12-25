import { Pane } from "tweakpane";

import { FullscreenPass } from "./FullscreenPass";
import { RaytracingPass } from "./RaytracingPass";
import { Renderer } from "./Renderer";

const PARAMS = {
  color: {
    r: 0.2,
    g: 1.0,
    b: 0.4,
  },
  maxBounces: 6,
  samplesPerPixel: 4,
  denoise: true,
  tonemapping: 1,
  camera: {
    position: {
      x: 0.0,
      y: 0.4,
      z: -2.0,
    },
    direction: {
      x: 0.0,
      y: -0.2,
      z: 1.0,
    },
    fov: 45,
    focalDistance: 2.0,
    aperture: 0.03,
  },
};

const pane = new Pane({ title: "Parameters" });

pane.addBinding(PARAMS, "color", {
  min: 0,
  max: 1,
  step: 0.01,
  color: { type: "float" },
});
pane.addBinding(PARAMS, "maxBounces", { min: 0, max: 10, step: 1 });
pane.addBinding(PARAMS, "samplesPerPixel", { min: 1, max: 16, step: 1 });
const cameraFolder = pane.addFolder({ title: "Camera" });
cameraFolder.addBinding(PARAMS.camera, "position");
cameraFolder.addBinding(PARAMS.camera, "direction");
cameraFolder.addBinding(PARAMS.camera, "fov", { min: 1, max: 120 });
cameraFolder.addBinding(PARAMS.camera, "focalDistance", { min: 0.1, max: 10 });
cameraFolder.addBinding(PARAMS.camera, "aperture", { min: 0.0, max: 0.5 });
const postprocessingFolder = pane.addFolder({ title: "Post-processing" });
postprocessingFolder.addBinding(PARAMS, "denoise");
postprocessingFolder.addBinding(PARAMS, "tonemapping", {
  options: {
    none: 0,
    aces: 1,
    reinhard: 2,
  },
});

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

  const update = () => {
    const uniforms = {
      ...PARAMS,
      color: Object.values(PARAMS.color),
      denoise: PARAMS.denoise ? 1 : 0,
      camera: {
        ...PARAMS.camera,
        position: Object.values(PARAMS.camera.position),
        direction: Object.values(PARAMS.camera.direction),
      },
    };
    raytracingPass.setUniforms(uniforms);
    fullscreenPass.setUniforms(uniforms);
    raytracingPass.reset();
  };
  update();
  pane.on("change", update);

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    // Update uniforms
    const time = (timestamp - startTime) / 1000;
    raytracingPass.update({ time });
    fullscreenPass.update({ time });

    // Render
    if (renderer.isSampling()) {
      const commandEncoder = renderer.device.createCommandEncoder();

      raytracingPass.render(commandEncoder);
      raytracingPass.copyOutputTextureToPrev(commandEncoder);
      fullscreenPass.render(commandEncoder);

      const commandBuffer = commandEncoder.finish();
      renderer.device.queue.submit([commandBuffer]);
    }

    requestAnimationFrame(render);
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
