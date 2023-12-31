import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as CamerakitPlugin from "@tweakpane/plugin-camerakit";
import NProgress from "nprogress";
import * as THREE from "three";

import { Renderer } from "./renderer";
import { KeyboardControls } from "./controls/keyboard";
import { RaytracingCamera, RaytracingMaterial } from "./scene";

// Check for WebGPU support
const supported = await Renderer.supported();
if (!supported) {
  throw new Error("WebGPU is not supported.");
}

// Create renderer
const renderer = await Renderer.create();
document.body.appendChild(renderer.canvas);

// Setup Scene
const camera = new RaytracingCamera(45);
camera.position.copy(new THREE.Vector3(0, 1, 4));
const scene = new THREE.Scene();

const white = new RaytracingMaterial();
white.color.set(1.0, 1.0, 1.0);
white.roughness = 1;
white.metalness = 0.02;
white.specularColor.set(1.0, 1.0, 1.0);

const red = new RaytracingMaterial();
red.color.set(1.0, 0.05, 0.05);
red.roughness = 1.0;
red.metalness = 0.0;
red.specularColor.set(1.0, 1.0, 1.0);

const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), white);
plane.rotateX(-Math.PI / 2);
scene.add(plane);

const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), red);
scene.add(box);

// Setup Tweakpane
const pane = new Pane({ title: "Parameters" });
pane.registerPlugin(EssentialsPlugin);
pane.registerPlugin(CamerakitPlugin);

const PARAMS = {
  maxBounces: 4,
  denoise: true,
  tonemapping: 1,
};

const fpsGraph = pane.addBlade({
  view: "fpsgraph",
  label: "fps",
});

pane.addBinding(renderer, "progress", {
  readonly: true,
  format: (value) =>
    `${renderer.status} - ${
      (renderer.frame - 1) * renderer.samplesPerFrame
    }spp (${Math.round(value * 100)}%)`,
});

const controls = pane.addBlade({
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

const scales = [10, 25, 50, 75, 100];
pane
  .addBinding(renderer, "scalingFactor", {
    view: "radiogrid",
    groupName: "scale",
    size: [5, 1],
    cells: (x: number, y: number) => ({
      title: `${scales[y * 3 + x]}%`,
      value: scales[y * 3 + x] / 100,
    }),
  })
  .on("change", () => renderer.reset());

pane
  .addBinding(renderer, "frames", { min: 2, max: 512, step: 1 })
  .on("change", ({ last }) => {
    if (!last) return;
    renderer.reset();
  });

pane
  .addBinding(renderer, "samplesPerFrame", { min: 1, max: 16, step: 1 })
  .on("change", ({ last }) => {
    if (!last) return;
    renderer.reset();
  });

pane
  .addBinding(PARAMS, "maxBounces", { min: 0, max: 10, step: 1 })
  .on("change", ({ last }) => {
    if (!last) return;
    renderer.setUniforms("raytrace", { maxBounces: PARAMS.maxBounces });
    renderer.reset();
  });

const cameraFolder = pane.addFolder({ title: "Camera" });

cameraFolder
  .addBinding(camera, "position")
  .on("change", () => renderer.reset());

cameraFolder
  .addBinding(camera, "rotation")
  .on("change", () => renderer.reset());

cameraFolder
  .addBinding(camera, "fov", {
    view: "cameraring",
    min: 10,
    max: 120,
  })
  .on("change", () => renderer.reset());

cameraFolder
  .addBinding(camera, "focalDistance", { min: 0.1, max: 10 })
  .on("change", () => renderer.reset());

cameraFolder
  .addBinding(camera, "aperture", { min: 0.0, max: 0.5 })
  .on("change", () => renderer.reset());

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

pane.addButton({ title: "Screenshot" }).on("click", () => {
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
renderer.setUniforms("raytrace", {
  maxBounces: PARAMS.maxBounces,
});
renderer.setUniforms("fullscreen", {
  denoise: PARAMS.denoise ? 1 : 0,
  tonemapping: PARAMS.tonemapping,
});

// Start rendering
function render() {
  (fpsGraph as any).begin();

  keyboardControls.update();
  renderer.render(scene, camera);

  (fpsGraph as any).end();

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
