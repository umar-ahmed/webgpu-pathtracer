import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as CamerakitPlugin from "@tweakpane/plugin-camerakit";
import NProgress from "nprogress";

import { FullscreenPass } from "./FullscreenPass";
import { RaytracingPass } from "./RaytracingPass";
import { Renderer } from "./Renderer";

const PARAMS = {
  color: {
    r: 1.0,
    g: 1.0,
    b: 1.0,
  },
  scalingFactor: 0.25,
  maxSamples: 64,
  maxBounces: 4,
  samplesPerPixel: 2,
  denoise: true,
  tonemapping: 1,
  camera: {
    position: {
      x: 0.0,
      y: 0.6,
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
pane.registerPlugin(EssentialsPlugin);
pane.registerPlugin(CamerakitPlugin);

const fpsGraph = pane.addBlade({
  view: "fpsgraph",
  label: "fps",
});
const color = pane.addBinding(PARAMS, "color", {
  min: 0,
  max: 1,
  step: 0.01,
  color: { type: "float" },
});
const scales = [10, 25, 50, 75, 100];
const scalingFactor = pane.addBinding(PARAMS, "scalingFactor", {
  view: "radiogrid",
  groupName: "scale",
  size: [5, 1],
  cells: (x: number, y: number) => ({
    title: `${scales[y * 3 + x]}%`,
    value: scales[y * 3 + x] / 100,
  }),
});
const maxSamples = pane.addBinding(PARAMS, "maxSamples", {
  min: 2,
  max: 512,
  step: 1,
});
const maxBounces = pane.addBinding(PARAMS, "maxBounces", {
  min: 0,
  max: 10,
  step: 1,
});
const samplesPerPixel = pane.addBinding(PARAMS, "samplesPerPixel", {
  min: 1,
  max: 16,
  step: 1,
});
const cameraFolder = pane.addFolder({ title: "Camera" });
const cameraPosition = cameraFolder.addBinding(PARAMS.camera, "position");
const cameraDirection = cameraFolder.addBinding(PARAMS.camera, "direction");
const cameraFOV = cameraFolder.addBinding(PARAMS.camera, "fov", {
  view: "cameraring",
  min: 10,
  max: 120,
});
const cameraFocalDistance = cameraFolder.addBinding(
  PARAMS.camera,
  "focalDistance",
  { min: 0.1, max: 10 }
);
const cameraAperture = cameraFolder.addBinding(PARAMS.camera, "aperture", {
  min: 0.0,
  max: 0.5,
});
const postprocessingFolder = pane.addFolder({ title: "Post-processing" });
const denoise = postprocessingFolder.addBinding(PARAMS, "denoise");
const tonemapping = postprocessingFolder.addBinding(PARAMS, "tonemapping", {
  options: {
    none: 0,
    aces: 1,
    reinhard: 2,
  },
});
const screenshotButton = pane.addButton({ title: "Screenshot" });

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

  pane.addBinding(renderer, "progress", {
    index: 1,
    readonly: true,
    format: (value) =>
      `${renderer.status} - ${renderer.frame - 1}/${
        renderer.maxSamples
      } (${Math.round(value * 100)}%)`,
  });
  const controls = pane.addBlade({
    index: 2,
    view: "buttongrid",
    size: [3, 1],
    cells: (x: number) => ({
      title: ["▶︎", "⏸", "Reset"][x],
    }),
    label: "",
  }) as EssentialsPlugin.ButtonGridApi;
  controls.cell(0, 0)!.disabled = true;
  controls.on("click", ({ index: [x] }: { index: [number, number] }) => {
    switch (x) {
      case 0:
        renderer.start();
        controls.cell(0, 0)!.disabled = true;
        controls.cell(1, 0)!.disabled = false;
        break;
      case 1:
        renderer.pause();
        controls.cell(0, 0)!.disabled = false;
        controls.cell(1, 0)!.disabled = true;
        break;
      case 2:
        renderer.reset();
        break;
    }
  });

  screenshotButton.on("click", () => {
    const link = document.createElement("a");
    link.download = "screenshot.png";
    link.href = renderer.canvas.toDataURL("image/png");
    link.click();
  });

  const update = (params = PARAMS) => {
    const uniforms = {
      ...params,
      color: Object.values(params.color),
      denoise: params.denoise ? 1 : 0,
      camera: {
        ...params.camera,
        position: Object.values(params.camera.position),
        direction: Object.values(params.camera.direction),
      },
    };
    raytracingPass.setUniforms(uniforms);
    fullscreenPass.setUniforms(uniforms);
    renderer.scalingFactor = params.scalingFactor;
  };

  // Initial uniforms
  update();

  // Update uniforms when parameters change
  color.on("change", ({ value }) => {
    raytracingPass.setUniforms({ color: Object.values(value) });
    renderer.reset();
  });
  scalingFactor.on("change", ({ value }) => {
    renderer.scalingFactor = value;
    fullscreenPass.setUniforms({ scalingFactor: value });
    renderer.reset();
  });
  maxSamples.on("change", ({ value, last }) => {
    if (!last) return;
    renderer.maxSamples = value;
    renderer.reset();
  });
  maxBounces.on("change", ({ value, last }) => {
    if (!last) return;
    raytracingPass.setUniforms({ maxBounces: value });
    renderer.reset();
  });
  samplesPerPixel.on("change", ({ value, last }) => {
    if (!last) return;
    raytracingPass.setUniforms({ samplesPerPixel: value });
    renderer.reset();
  });
  cameraPosition.on("change", ({ value }) => {
    raytracingPass.setUniforms({ camera: { position: Object.values(value) } });
    renderer.reset();
  });
  cameraDirection.on("change", ({ value }) => {
    raytracingPass.setUniforms({ camera: { direction: Object.values(value) } });
    renderer.reset();
  });
  cameraFOV.on("change", ({ value }) => {
    raytracingPass.setUniforms({ camera: { fov: value } });
    renderer.reset();
  });
  cameraFocalDistance.on("change", ({ value }) => {
    raytracingPass.setUniforms({ camera: { focalDistance: value } });
    renderer.reset();
  });
  cameraAperture.on("change", ({ value }) => {
    raytracingPass.setUniforms({ camera: { aperture: value } });
    renderer.reset();
  });
  denoise.on("change", ({ value }) => {
    fullscreenPass.setUniforms({ denoise: value ? 1 : 0 });
  });
  tonemapping.on("change", ({ value }) => {
    fullscreenPass.setUniforms({ tonemapping: value });
  });

  // Update progress bar
  NProgress.configure({ showSpinner: false, trickle: false });
  renderer.on("start", () => NProgress.start());
  renderer.on("reset", () => NProgress.set(0));
  renderer.on("progress", (progress) => NProgress.set(progress));
  renderer.on("complete", () => NProgress.done());

  const keyboardState = new Map<string, boolean>();
  document.addEventListener("keydown", (event) => {
    keyboardState.set(event.key, true);
  });
  document.addEventListener("keyup", (event) => {
    keyboardState.set(event.key, false);
  });

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    (fpsGraph as any).begin();

    // Update uniforms
    const time = (timestamp - startTime) / 1000;
    if (renderer.status === "sampling") {
      raytracingPass.update({ time });
    }
    fullscreenPass.update({ time });

    // Update camera
    let shouldUpdate = false;
    const cam = PARAMS.camera;

    const speedMultiplier = keyboardState.get("Shift") ? 3 : 1;

    const movementSpeed = 0.02 * (cam.fov / 120) * speedMultiplier;
    const rotationSpeed = 0.01 * (cam.fov / 120) * speedMultiplier;

    if (keyboardState.get("w")) {
      cam.position.x += cam.direction.x * movementSpeed;
      cam.position.y += cam.direction.y * movementSpeed;
      cam.position.z += cam.direction.z * movementSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("s")) {
      cam.position.x -= cam.direction.x * movementSpeed;
      cam.position.y -= cam.direction.y * movementSpeed;
      cam.position.z -= cam.direction.z * movementSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("a")) {
      cam.position.x += cam.direction.z * movementSpeed;
      cam.position.z -= cam.direction.x * movementSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("d")) {
      cam.position.x -= cam.direction.z * movementSpeed;
      cam.position.z += cam.direction.x * movementSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("ArrowUp")) {
      cam.direction.y += rotationSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("ArrowDown")) {
      cam.direction.y -= rotationSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("ArrowLeft")) {
      cam.direction.x += rotationSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("ArrowRight")) {
      cam.direction.x -= rotationSpeed;
      shouldUpdate = true;
    }

    if (keyboardState.get("-")) {
      cam.fov = clamp(cam.fov - 0.5, 1, 120);
      shouldUpdate = true;
    }

    if (keyboardState.get("=")) {
      cam.fov = clamp(cam.fov + 0.5, 1, 120);
      shouldUpdate = true;
    }

    if (keyboardState.get("[")) {
      cam.aperture = clamp(cam.aperture - 0.01, 0, 0.5);
      shouldUpdate = true;
    }

    if (keyboardState.get("]")) {
      cam.aperture = clamp(cam.aperture + 0.01, 0, 0.5);
      shouldUpdate = true;
    }

    if (keyboardState.get("q")) {
      cam.focalDistance -= 0.1;
      shouldUpdate = true;
    }

    if (keyboardState.get("e")) {
      cam.focalDistance += 0.1;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      // Update tweakpane
      pane.refresh();

      // Temporarily reduce settings to improve performance
      update({
        ...PARAMS,
        samplesPerPixel: 1,
        maxBounces: 3,
        denoise: false,
      });

      // Restart raytracing to prevent smearing
      renderer.reset();
    } else {
      // Reset settings
      update();
    }

    // Render
    const commandEncoder = renderer.device.createCommandEncoder();

    if (renderer.status === "sampling") {
      if (renderer.isSampling()) {
        raytracingPass.render(commandEncoder);
        renderer.emit("progress", renderer.progress);
      }
    }

    fullscreenPass.render(commandEncoder);

    const commandBuffer = commandEncoder.finish();
    renderer.device.queue.submit([commandBuffer]);

    (fpsGraph as any).end();
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
  });

  try {
    observer.observe(renderer.canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(renderer.canvas, { box: "content-box" });
  }

  renderer.start();
  render(performance.now());
}

main().catch((err) => {
  console.error(err);
});
