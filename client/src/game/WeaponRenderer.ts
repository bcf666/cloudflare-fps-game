import {
  Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Camera
} from '@babylonjs/core';

export class WeaponRenderer {
  root: TransformNode;
  private scene: Scene;
  private camera: Camera;
  private muzzleFlash: TransformNode;
  private flashVisible = false;
  private flashTimer = 0;
  private bobT = 0;

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene; this.camera = camera;
    this.root = new TransformNode('wpn_root', scene);
    this.root.parent = camera;
    this.root.position.set(0.22, -0.22, -0.38);

    const bodyMat = new StandardMaterial('wpn_body', scene);
    bodyMat.diffuseColor = new Color3(0.1, 0.1, 0.12);
    bodyMat.specularColor = new Color3(0.3, 0.3, 0.35);
    bodyMat.roughness = 0.4;

    const body = MeshBuilder.CreateBox('wpn_body', { width: 0.08, height: 0.15, depth: 0.32 }, scene);
    body.parent = this.root;
    body.material = bodyMat;

    const barrel = MeshBuilder.CreateBox('wpn_barrel', { width: 0.04, height: 0.04, depth: 0.22 }, scene);
    barrel.parent = this.root;
    barrel.position.z = -0.26;
    barrel.material = bodyMat;

    const sight = MeshBuilder.CreateBox('wpn_sight', { width: 0.02, height: 0.04, depth: 0.06 }, scene);
    sight.parent = this.root;
    sight.position.set(0, 0.1, -0.02);
    sight.material = bodyMat;

    const grip = MeshBuilder.CreateBox('wpn_grip', { width: 0.06, height: 0.18, depth: 0.07 }, scene);
    grip.parent = this.root;
    grip.position.set(0, -0.14, 0.02);
    grip.rotation.x = 0.2;
    const gripMat = new StandardMaterial('wpn_gripmat', scene);
    gripMat.diffuseColor = new Color3(0.18, 0.12, 0.08);
    grip.material = gripMat;

    const mag = MeshBuilder.CreateBox('wpn_mag', { width: 0.04, height: 0.14, depth: 0.06 }, scene);
    mag.parent = this.root;
    mag.position.set(0, -0.1, 0.08);
    mag.material = gripMat;

    this.muzzleFlash = new TransformNode('flash_root', scene);
    this.muzzleFlash.parent = barrel;
    this.muzzleFlash.position.z = -0.14;
    const flashMesh = MeshBuilder.CreateSphere('flash', { diameter: 0.13, segments: 8 }, scene);
    flashMesh.parent = this.muzzleFlash;
    const fm = new StandardMaterial('flash_mat', scene);
    fm.emissiveColor = new Color3(1, 0.85, 0.35);
    fm.diffuseColor = new Color3(0, 0, 0);
    flashMesh.material = fm;
    this.muzzleFlash.setEnabled(false);
  }

  showMuzzleFlash() {
    this.muzzleFlash.setEnabled(true);
    this.flashVisible = true;
    this.flashTimer = 0.06;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    const s = 0.85 + Math.random() * 0.6;
    this.muzzleFlash.scaling.set(s, s, s);
    // 后坐力
    this.root.position.z = -0.30;
  }

  update(dt: number, shooting: boolean, reloading: boolean, walking: boolean) {
    if (this.flashVisible) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) { this.muzzleFlash.setEnabled(false); this.flashVisible = false; }
    }
    // 后坐力恢复
    this.root.position.z += (-0.38 - this.root.position.z) * Math.min(1, dt * 15);
    // 换弹时倾斜
    if (reloading) {
      const t = (Date.now() % 2000) / 2000;
      this.root.rotation.x = -0.7 * Math.sin(Math.min(1, t / 0.6) * Math.PI) * (t < 0.7 ? 1 : 0);
    } else {
      this.root.rotation.x *= (1 - Math.min(1, dt * 8));
    }
    // 走路摆动
    if (walking) this.bobT += dt * 10;
    const bob = walking ? Math.sin(this.bobT) * 0.012 : 0;
    this.root.position.y = -0.22 + bob;
    this.root.position.x = 0.22 + Math.sin(this.bobT / 2) * 0.004;
  }

  dispose() { this.root.dispose(false, true); }
}
