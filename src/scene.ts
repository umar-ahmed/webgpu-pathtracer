import * as THREE from "three";

export class RaytracingCamera extends THREE.PerspectiveCamera {
  public focalDistance: number = 1;
  public aperture: number = 0;
}

export class RaytracingMaterial extends THREE.MeshStandardMaterial {
  public specularColor = new THREE.Color();
}
