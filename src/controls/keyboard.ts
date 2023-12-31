import { RaytracingCamera } from "../scene";
import { clamp } from "../utils";
import * as THREE from "three";

type KeyboardControlsEventMap = {
  change: () => void;
};

export type KeyboardControlsEventType = keyof KeyboardControlsEventMap;

export class KeyboardControls {
  private object: RaytracingCamera;
  private state = new Map<string, boolean>();
  private listeners: Map<KeyboardControlsEventType, any[]> = new Map();

  constructor(object: RaytracingCamera) {
    this.object = object;
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
  }

  onKeyDown(event: KeyboardEvent) {
    this.state.set(event.key, true);
  }

  onKeyUp(event: KeyboardEvent) {
    this.state.set(event.key, false);
  }

  isKeyPressed(key: string) {
    return this.state.get(key) ?? false;
  }

  update() {
    let didUpdate = false;
    const cam = this.object;

    const speedMultiplier = this.isKeyPressed("Shift") ? 3 : 1;

    const movementSpeed = 0.02 * (cam.fov / 120) * speedMultiplier;
    const rotationSpeed = 0.01 * (cam.fov / 120) * speedMultiplier;

    if (this.isKeyPressed("w")) {
      cam.position.add(
        new THREE.Vector3(0, 0, -movementSpeed).applyQuaternion(cam.quaternion)
      );
      didUpdate = true;
    }

    if (this.isKeyPressed("s")) {
      cam.position.add(
        new THREE.Vector3(0, 0, movementSpeed).applyQuaternion(cam.quaternion)
      );
      didUpdate = true;
    }

    if (this.isKeyPressed("a")) {
      cam.position.add(
        new THREE.Vector3(-movementSpeed, 0, 0).applyQuaternion(cam.quaternion)
      );
      didUpdate = true;
    }

    if (this.isKeyPressed("d")) {
      cam.position.add(
        new THREE.Vector3(movementSpeed, 0, 0).applyQuaternion(cam.quaternion)
      );
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowUp")) {
      cam.rotation.x += rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowDown")) {
      cam.rotation.x -= rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowLeft")) {
      cam.rotation.y += rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowRight")) {
      cam.rotation.y -= rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("-")) {
      cam.fov = clamp(cam.fov - 0.5, 1, 120);
      didUpdate = true;
    }

    if (this.isKeyPressed("=")) {
      cam.fov = clamp(cam.fov + 0.5, 1, 120);
      didUpdate = true;
    }

    if (this.isKeyPressed("[")) {
      cam.aperture = clamp(cam.aperture - 0.01, 0, 0.5);
      didUpdate = true;
    }

    if (this.isKeyPressed("]")) {
      cam.aperture = clamp(cam.aperture + 0.01, 0, 0.5);
      didUpdate = true;
    }

    if (this.isKeyPressed("q")) {
      cam.focalDistance -= 0.1;
      didUpdate = true;
    }

    if (this.isKeyPressed("e")) {
      cam.focalDistance += 0.1;
      didUpdate = true;
    }

    if (didUpdate) {
      this.emit("change");
    }

    return didUpdate;
  }

  on(event: "change", callback: () => void): void;
  on(event: KeyboardControlsEventType, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)?.push(callback);
  }

  emit(event: "change"): void;
  emit(event: KeyboardControlsEventType, ...args: any[]) {
    this.listeners.get(event)?.forEach((callback: any) => callback(...args));
  }
}
