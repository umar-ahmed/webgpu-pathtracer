import * as THREE from "three";

export class RaytracingScene extends THREE.Scene {
  public needsUpdate: boolean = false;
}

export class RaytracingCamera extends THREE.PerspectiveCamera {
  public focalDistance: number = 1;
  public aperture: number = 0;
}

export class RaytracingMaterial extends THREE.MeshStandardMaterial {
  public specularColor = new THREE.Color();
}
