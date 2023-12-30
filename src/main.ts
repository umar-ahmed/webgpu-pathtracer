import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as CamerakitPlugin from "@tweakpane/plugin-camerakit";
import NProgress from "nprogress";

import { Renderer } from "./renderer";
import { KeyboardControls } from "./controls/keyboard";
import { Camera, Geometry, Material, Mesh, Scene, Vector3 } from "./scene";

// Check for WebGPU support
const supported = await Renderer.supported();
if (!supported) {
  throw new Error("WebGPU is not supported.");
}

// Create renderer
const renderer = await Renderer.create();
document.body.appendChild(renderer.canvas);

// Setup Scene
const camera = new Camera(45, 2.0, 0.03);
camera.position.copy(new Vector3(0, 0.6, -2));
const scene = new Scene();
const geometry = Geometry.createBox(1, 1, 1);
const material = new Material();
const mesh = new Mesh(geometry, material);
scene.add(mesh);

// Setup Tweakpane
const PARAMS = {
  scalingFactor: 0.25,
  frames: 64,
  samplesPerFrame: 1,
  maxBounces: 4,
  denoise: true,
  tonemapping: 1,
  camera: {
    position: {
      x: 0.0,
      y: 2.0,
      z: -6.0,
    },
    direction: {
      x: 0.0,
      y: -0.3,
      z: 1.0,
    },
    fov: 45,
    focalDistance: 4.0,
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

pane
  .addBinding(material, "color", {
    min: 0,
    max: 1,
    step: 0.01,
    color: { type: "float" },
  })
  .on("change", ({ value }) => {
    renderer.setUniforms("raytrace", { color: Object.values(value) });
    renderer.reset();
  });

const scales = [10, 25, 50, 75, 100];
pane
  .addBinding(PARAMS, "scalingFactor", {
    view: "radiogrid",
    groupName: "scale",
    size: [5, 1],
    cells: (x: number, y: number) => ({
      title: `${scales[y * 3 + x]}%`,
      value: scales[y * 3 + x] / 100,
    }),
  })
  .on("change", ({ value }) => {
    renderer.scalingFactor = value;
    renderer.setUniforms("fullscreen", { scalingFactor: value });
    renderer.reset();
  });

pane
  .addBinding(PARAMS, "frames", {
    min: 2,
    max: 512,
    step: 1,
  })
  .on("change", ({ value, last }) => {
    if (!last) return;
    renderer.frames = value;
    renderer.reset();
  });

pane
  .addBinding(PARAMS, "samplesPerFrame", {
    min: 1,
    max: 16,
    step: 1,
  })
  .on("change", ({ value, last }) => {
    if (!last) return;
    renderer.samplesPerFrame = value;
    renderer.reset();
  });

pane
  .addBinding(PARAMS, "maxBounces", {
    min: 0,
    max: 10,
    step: 1,
  })
  .on("change", ({ value, last }) => {
    if (!last) return;
    renderer.setUniforms("raytrace", { maxBounces: value });
    renderer.reset();
  });

const cameraFolder = pane.addFolder({ title: "Camera" });

cameraFolder.addBinding(PARAMS.camera, "position").on("change", ({ value }) => {
  renderer.setUniforms("raytrace", {
    camera: { position: Object.values(value) },
  });
  renderer.reset();
});

cameraFolder
  .addBinding(PARAMS.camera, "direction")
  .on("change", ({ value }) => {
    renderer.setUniforms("raytrace", {
      camera: { direction: Object.values(value) },
    });
    renderer.reset();
  });

cameraFolder
  .addBinding(PARAMS.camera, "fov", {
    view: "cameraring",
    min: 10,
    max: 120,
  })
  .on("change", ({ value }) => {
    renderer.setUniforms("raytrace", { camera: { fov: value } });
    renderer.reset();
  });

cameraFolder
  .addBinding(PARAMS.camera, "focalDistance", { min: 0.1, max: 10 })
  .on("change", ({ value }) => {
    renderer.setUniforms("raytrace", { camera: { focalDistance: value } });
    renderer.reset();
  });

cameraFolder
  .addBinding(PARAMS.camera, "aperture", {
    min: 0.0,
    max: 0.5,
  })
  .on("change", ({ value }) => {
    renderer.setUniforms("raytrace", { camera: { aperture: value } });
    renderer.reset();
  });

const postprocessingFolder = pane.addFolder({ title: "Post-processing" });

postprocessingFolder.addBinding(PARAMS, "denoise").on("change", ({ value }) => {
  renderer.setUniforms("fullscreen", { denoise: value ? 1 : 0 });
});

postprocessingFolder
  .addBinding(PARAMS, "tonemapping", {
    options: {
      none: 0,
      aces: 1,
      reinhard: 2,
    },
  })
  .on("change", ({ value }) => {
    renderer.setUniforms("fullscreen", { tonemapping: value });
  });

const screenshotButton = pane.addButton({ title: "Screenshot" });

// Tweakpane
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

// Update progress bar
NProgress.configure({ showSpinner: false, trickle: false });
renderer.on("start", () => NProgress.start());
renderer.on("reset", () => NProgress.set(0));
renderer.on("progress", (progress) => NProgress.set(progress));
renderer.on("complete", () => NProgress.done());

// Keyboard controls
const keyboardControls = new KeyboardControls(camera);
keyboardControls.on("change", () => {
  pane.refresh();
  renderer.reset();
});

// Set initial uniforms based on PARAMS
const uniforms = {
  ...PARAMS,
  denoise: PARAMS.denoise ? 1 : 0,
  camera: {
    ...PARAMS.camera,
    position: Object.values(PARAMS.camera.position),
    direction: Object.values(PARAMS.camera.direction),
  },
};
renderer.setUniforms("raytrace", uniforms);
renderer.setUniforms("fullscreen", uniforms);
renderer.samplesPerFrame = PARAMS.samplesPerFrame;
renderer.scalingFactor = PARAMS.scalingFactor;

// Start rendering
renderer.start();

function render() {
  (fpsGraph as any).begin();

  keyboardControls.update();
  renderer.render(scene, camera);

  (fpsGraph as any).end();

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
