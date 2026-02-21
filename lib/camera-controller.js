import * as THREE from 'three';

export class CameraController {
  constructor(camera, { initialMode = 'classic', initialCamPos = new THREE.Vector3(0, 4.5, 8) } = {}) {
    this.camera = camera;
    this.modes = ['classic', 'fortnite'];
    this.modeConfig = {
      classic: { dist: 7.2, eyeHeight: 2.3, sideOffset: 0, lookHeight: 1.2, positionLerp: 0.24 },
      fortnite: { dist: 4.0, eyeHeight: 1.55, sideOffset: 0, lookHeight: 1.4, positionLerp: 0.24 },
    };
    this.mode = this.modeConfig[initialMode] ? initialMode : 'classic';
    this.camPos = initialCamPos.clone();
    this.kick = new THREE.Vector2(0, 0);
  }

  applyKick(strength) {
    this.kick.x += (Math.random() - 0.5) * strength * 0.8;
    this.kick.y += strength;
  }

  decayKick(dt) {
    this.kick.multiplyScalar(Math.pow(0.001, dt));
  }

  cycleMode() {
    const idx = this.modes.indexOf(this.mode);
    this.mode = this.modes[(idx + 1) % this.modes.length];
    return this.mode;
  }

  getGroundForward(yaw) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    return forward.normalize();
  }

  update({ playerPos, cameraYaw, cameraPitch }) {
    const mode = this.modeConfig[this.mode];

    const back = new THREE.Vector3(
      Math.sin(cameraYaw) * mode.dist * Math.cos(cameraPitch),
      Math.sin(cameraPitch) * mode.dist + mode.eyeHeight,
      Math.cos(cameraYaw) * mode.dist * Math.cos(cameraPitch)
    );

    const right = new THREE.Vector3(
      Math.sin(cameraYaw + Math.PI / 2),
      0,
      Math.cos(cameraYaw + Math.PI / 2)
    ).multiplyScalar(mode.sideOffset);

    const targetCamPos = new THREE.Vector3().copy(playerPos).add(back).add(right);
    this.camPos.lerp(targetCamPos, mode.positionLerp);
    this.camera.position.copy(this.camPos);

    const lookTarget = new THREE.Vector3().copy(playerPos).add(new THREE.Vector3(0, mode.lookHeight, 0));
    const lookWithKick = lookTarget.clone()
      .add(new THREE.Vector3(Math.sin(cameraYaw + Math.PI / 2) * this.kick.x, 0, Math.cos(cameraYaw + Math.PI / 2) * this.kick.x))
      .add(new THREE.Vector3(0, this.kick.y, 0));

    this.camera.lookAt(lookWithKick);
  }
}

