import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as CamerakitPlugin from "@tweakpane/plugin-camerakit";
import * as FileImportPlugin from "tweakpane-plugin-file-import";
import NProgress from "nprogress";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { Renderer } from "./renderer";
import { RaytracingCamera, RaytracingMaterial, RaytracingScene } from "./scene";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

// Check for WebGPU support
const diagnostic = await Renderer.diagnostic();
if (!diagnostic.supported) {
  throw new Error("WebGPU is not supported.");
}

// Print out some information about the device
console.info("✅ WebGPU enabled.");
console.table(diagnostic.info);

// Create renderer
const renderer = await Renderer.create();
document.body.appendChild(renderer.canvas);

const ENVMAPS = [
  "kloofendal_48d_partly_cloudy_puresky_1k.hdr",
  "golden_bay_1k.hdr",
  "hayloft_1k.hdr",
];

// Setup Scene
const scene = new RaytracingScene();

const camera = new RaytracingCamera(45);
camera.position.copy(new THREE.Vector3(0, 1, 4));

const envMapLoader = new RGBELoader()
  .setPath("/static/env/")
  .setDataType(THREE.FloatType);
const envMapTexture = await envMapLoader.loadAsync(ENVMAPS[0]);
envMapTexture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = envMapTexture;
scene.environment = envMapTexture;

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

const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), white);
plane.rotateX(-Math.PI / 2);
scene.add(plane);

const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), red);
box.position.y = 0.4;
box.position.z = 0.5;
scene.add(box);

const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), white);
sphere.position.y = 0.5;
sphere.position.z = -0.5;
scene.add(sphere);

scene.needsUpdate = true;

// Setup Tweakpane
const pane = new Pane({ title: "Parameters" });
pane.registerPlugin(EssentialsPlugin);
pane.registerPlugin(CamerakitPlugin);
pane.registerPlugin(FileImportPlugin);

const PARAMS = {
  maxBounces: 4,
  denoise: true,
  accumulate: true,
  tonemapping: 1,
  envMap: ENVMAPS[0],
  envMapIntensity: 1.0,
  envMapRotation: 0.0,
  file: "",
};

const fpsGraph = pane.addBlade({
  view: "fpsgraph",
  label: "fps",
});

pane.addBinding(renderer.timings.raytrace, "value", {
  label: "raytrace",
  readonly: true,
  format: (value) =>
    value.toLocaleString(undefined, {
      style: "unit",
      unit: "microsecond",
      unitDisplay: "short",
    }),
});

pane.addBinding(renderer.timings.accumulate, "value", {
  label: "accumulate",
  readonly: true,
  format: (value) =>
    value.toLocaleString(undefined, {
      style: "unit",
      unit: "microsecond",
      unitDisplay: "short",
    }),
});

pane.addBinding(renderer.timings.fullscreen, "value", {
  label: "fullscreen",
  readonly: true,
  format: (value) =>
    value.toLocaleString(undefined, {
      style: "unit",
      unit: "microsecond",
      unitDisplay: "short",
    }),
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
  .addBinding(renderer, "frames", { min: 2, max: 2048, step: 1 })
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

pane.addBinding(PARAMS, "accumulate").on("change", ({ value }) => {
  renderer.setUniforms("accumulate", { enabled: value ? 1 : 0 });
  renderer.reset();
});

const sceneFolder = pane.addFolder({ title: "Scene" });

sceneFolder
  .addBinding(PARAMS, "envMap", {
    view: "select",
    options: ENVMAPS.reduce((acc, x) => ({ ...acc, [x]: x }), {}),
  })
  .on("change", async ({ value }) => {
    const envMapTexture = await envMapLoader.loadAsync(value);
    envMapTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = envMapTexture;
    scene.environment = envMapTexture;
    scene.needsUpdate = true;
    renderer.reset();
  });

sceneFolder
  .addBinding(PARAMS, "envMapIntensity", { min: 0.0, max: 4.0 })
  .on("change", () => {
    renderer.setUniforms("raytrace", {
      envMapIntensity: PARAMS.envMapIntensity,
    });
    renderer.reset();
  });

sceneFolder
  .addBinding(PARAMS, "envMapRotation", {
    min: -180.0,
    max: 180.0,
    step: 0.01,
    format: (x) => `${x}°`,
  })
  .on("change", () => {
    renderer.setUniforms("raytrace", {
      envMapRotation: PARAMS.envMapRotation * (Math.PI / 180),
    });
    renderer.reset();
  });

sceneFolder
  .addBinding(PARAMS, "file", {
    view: "file-input",
    lineCount: 2,
    filetypes: [".glb", ".gltf"],
  })
  .on("change", async (ev) => {
    const file = ev.value as unknown as File | null;
    if (file instanceof File) {
      try {
        NProgress.start();
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("/static/draco/");
        loader.setDRACOLoader(dracoLoader);

        const gltf = await loader.loadAsync(URL.createObjectURL(file), (e) => {
          const progress = e.loaded / e.total;
          NProgress.set(progress);
          console.log(`Loading model: ${Math.round(progress * 100)}%`);
        });

        const model = gltf.scene;
        model.position.x = 0;
        model.position.y = 0.5;
        model.position.z = 0;
        const bounds = new THREE.Box3().setFromObject(model);
        const scale = 1 / Math.max(bounds.max.x, bounds.max.y, bounds.max.z);
        model.scale.set(scale, scale, scale);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = white;
          }
        });
        scene.clear();
        scene.add(model);
      } catch (error) {
        console.error("Failed to load model:", error);
        // Restore default scene on error
        scene.clear();
        scene.add(plane);
        scene.add(box);
        scene.add(sphere);
      } finally {
        NProgress.done();
      }
    } else {
      scene.clear();
      scene.add(plane);
      scene.add(box);
      scene.add(sphere);
    }

    scene.needsUpdate = true;
    renderer.update(scene, camera);
    renderer.reset();
  });

const cameraFolder = pane.addFolder({ title: "Camera", expanded: false });

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

const postprocessingFolder = pane.addFolder({
  title: "Post-processing",
  expanded: false,
});

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

// Orbit controls
const orbitControls = new OrbitControls(camera, renderer.canvas);
orbitControls.addEventListener("change", () => {
  pane.refresh();
  renderer.reset();
});
orbitControls.update();

// Set initial uniforms based on PARAMS
renderer.setUniforms("raytrace", {
  maxBounces: PARAMS.maxBounces,
  envMapIntensity: PARAMS.envMapIntensity,
});
renderer.setUniforms("accumulate", {
  enabled: PARAMS.accumulate ? 1 : 0,
});
renderer.setUniforms("fullscreen", {
  denoise: PARAMS.denoise ? 1 : 0,
  tonemapping: PARAMS.tonemapping,
});

// Start rendering
let animationFrameId: number;
function render() {
  (fpsGraph as any).begin();

  orbitControls.update();
  renderer.render(scene, camera);

  (fpsGraph as any).end();

  animationFrameId = requestAnimationFrame(render);
}

// Start rendering
animationFrameId = requestAnimationFrame(render);

// Clean up resources when window is closed
window.addEventListener(
  "beforeunload",
  async () => {
    // Cancel any pending animation frames
    cancelAnimationFrame(animationFrameId);

    // Stop the renderer
    renderer.pause();

    // Ensure we wait for the renderer to be destroyed
    try {
      await renderer.destroy();
      orbitControls.dispose();
      pane.dispose();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  },
  { once: true }
);
