import { clamp } from "../utils";

type Camera = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  direction: {
    x: number;
    y: number;
    z: number;
  };
  fov: number;
  focalDistance: number;
  aperture: number;
};

export class KeyboardControls {
  private object: Camera;
  private state = new Map<string, boolean>();

  constructor(object: Camera) {
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
      cam.position.x += cam.direction.x * movementSpeed;
      cam.position.y += cam.direction.y * movementSpeed;
      cam.position.z += cam.direction.z * movementSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("s")) {
      cam.position.x -= cam.direction.x * movementSpeed;
      cam.position.y -= cam.direction.y * movementSpeed;
      cam.position.z -= cam.direction.z * movementSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("a")) {
      cam.position.x += cam.direction.z * movementSpeed;
      cam.position.z -= cam.direction.x * movementSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("d")) {
      cam.position.x -= cam.direction.z * movementSpeed;
      cam.position.z += cam.direction.x * movementSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowUp")) {
      cam.direction.y += rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowDown")) {
      cam.direction.y -= rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowLeft")) {
      cam.direction.x += rotationSpeed;
      didUpdate = true;
    }

    if (this.isKeyPressed("ArrowRight")) {
      cam.direction.x -= rotationSpeed;
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

    return didUpdate;
  }
}
