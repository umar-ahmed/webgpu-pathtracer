import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as CamerakitPlugin from "@tweakpane/plugin-camerakit";
import NProgress from "nprogress";

import { Renderer } from "./Renderer";
import { KeyboardControls } from "./KeyboardControls";

const PARAMS = {
  color: {
    r: 1.0,
    g: 1.0,
    b: 1.0,
  },
  scalingFactor: 0.25,
  frames: 64,
  samplesPerFrame: 1,
  maxBounces: 4,
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
const frames = pane.addBinding(PARAMS, "frames", {
  min: 2,
  max: 512,
  step: 1,
});
const samplesPerFrame = pane.addBinding(PARAMS, "samplesPerFrame", {
  min: 1,
  max: 16,
  step: 1,
});
const maxBounces = pane.addBinding(PARAMS, "maxBounces", {
  min: 0,
  max: 10,
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

  pane.addBinding(renderer, "progress", {
    index: 1,
    readonly: true,
    format: (value) =>
      `${renderer.status} - ${
        (renderer.frame - 1) * renderer.samplesPerFrame
      }spp (${Math.round(value * 100)}%)`,
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

  // Update uniforms when parameters change
  color.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", { color: Object.values(value) });
    renderer.reset();
  });
  scalingFactor.on("change", ({ value }) => {
    renderer.scalingFactor = value;
    renderer.setUniforms("fullscreen", { scalingFactor: value });
    renderer.reset();
  });
  frames.on("change", ({ value, last }) => {
    if (!last) return;
    renderer.frames = value;
    renderer.reset();
  });
  maxBounces.on("change", ({ value, last }) => {
    if (!last) return;
    renderer.setUniforms("raytracing", { maxBounces: value });
    renderer.reset();
  });
  samplesPerFrame.on("change", ({ value, last }) => {
    if (!last) return;
    renderer.samplesPerFrame = value;
    renderer.reset();
  });
  cameraPosition.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", {
      camera: { position: Object.values(value) },
    });
    renderer.reset();
  });
  cameraDirection.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", {
      camera: { direction: Object.values(value) },
    });
    renderer.reset();
  });
  cameraFOV.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", { camera: { fov: value } });
    renderer.reset();
  });
  cameraFocalDistance.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", { camera: { focalDistance: value } });
    renderer.reset();
  });
  cameraAperture.on("change", ({ value }) => {
    renderer.setUniforms("raytracing", { camera: { aperture: value } });
    renderer.reset();
  });
  denoise.on("change", ({ value }) => {
    renderer.setUniforms("fullscreen", { denoise: value ? 1 : 0 });
  });
  tonemapping.on("change", ({ value }) => {
    renderer.setUniforms("fullscreen", { tonemapping: value });
  });

  // Update progress bar
  NProgress.configure({ showSpinner: false, trickle: false });
  renderer.on("start", () => NProgress.start());
  renderer.on("reset", () => NProgress.set(0));
  renderer.on("progress", (progress) => NProgress.set(progress));
  renderer.on("complete", () => NProgress.done());

  // Keyboard controls
  const keyboardControls = new KeyboardControls(PARAMS.camera, renderer.canvas);

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
    renderer.setUniforms("raytracing", uniforms);
    renderer.setUniforms("fullscreen", uniforms);
    renderer.scalingFactor = params.scalingFactor;
  };

  // Initial uniforms
  update();

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    (fpsGraph as any).begin();

    // Update uniforms
    const time = (timestamp - startTime) / 1000;
    renderer.update(time);

    // Update camera
    const didUpdate = keyboardControls.update();
    if (didUpdate) {
      // Update tweakpane
      pane.refresh();

      // Temporarily reduce settings to improve performance
      update({
        ...PARAMS,
        samplesPerFrame: 1,
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
    renderer.render();

    (fpsGraph as any).end();
    requestAnimationFrame(render);
  }

  renderer.start();
  render(performance.now());
}

main().catch((err) => {
  console.error(err);
});
