import { Pane } from "tweakpane";

import { FullscreenPass } from "./FullscreenPass";
import { RaytracingPass } from "./RaytracingPass";
import { Renderer } from "./Renderer";

const PARAMS = {
  color: {
    r: 1.0,
    g: 1.0,
    b: 1.0,
  },
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
  };

  // Initial uniforms
  update();

  // Update uniforms when parameters change
  pane.on("change", () => {
    update();
    raytracingPass.reset();
  });

  const keyboardState = new Map<string, boolean>();
  document.addEventListener("keydown", (event) => {
    keyboardState.set(event.key, true);
  });
  document.addEventListener("keyup", (event) => {
    keyboardState.set(event.key, false);
  });

  const startTime = performance.now();

  function render(timestamp: DOMHighResTimeStamp) {
    // Update uniforms
    const time = (timestamp - startTime) / 1000;
    raytracingPass.update({ time });
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
      raytracingPass.reset();
    } else {
      // Reset settings
      update();
    }

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
