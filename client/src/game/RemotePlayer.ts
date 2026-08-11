import {
  Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion,
  TransformNode, Mesh
} from '@babylonjs/core';
import { PlayerState } from '@shared/protocol';
import { GAME_CONSTANTS, Team } from '@shared/constants';

const C = GAME_CONSTANTS;

export class RemotePlayer {
  id: string;
  team: Team;
  name: string;
  scene: Scene;
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  gun: Mesh;
  private teamMat: StandardMaterial;

  private prev: PlayerState | null = null;
  private curr: PlayerState | null = null;

  constructor(id: string, team: Team, name: string, scene: Scene) {
    this.id = id; this.team = team; this.name = name; this.scene = scene;
    this.root = new TransformNode(`rp_${id}`, scene);
    this.body = MeshBuilder.CreateCapsule(`rp_body_${id}`, {
      radius: C.PLAYER.RADIUS * 0.9,
      height: C.PLAYER.HEIGHT - 2 * C.PLAYER.RADIUS * 0.9,
      subdivisions: 2, tessellation: 6,
    }, scene);
    this.body.parent = this.root;
    this.body.position.y = C.PLAYER.HEIGHT / 2;
    this.head = MeshBuilder.CreateSphere(`rp_head_${id}`, { diameter: 0.38, segments: 10 }, scene);
    this.head.parent = this.root;
    this.head.position.y = C.PLAYER.HEIGHT - 0.08;
    this.gun = MeshBuilder.CreateBox(`rp_gun_${id}`, { width: 0.08, height: 0.12, depth: 0.4 }, scene);
    this.gun.parent = this.head;
    this.gun.position.set(0.2, -0.1, 0.3);
    this.teamMat = new StandardMaterial(`rp_mat_${id}`, scene);
    this.teamMat.diffuseColor = team === 'A' ? new Color3(0.25, 0.38, 0.92) : new Color3(0.95, 0.3, 0.4);
    this.teamMat.specularColor = new Color3(0.08, 0.08, 0.12);
    this.body.material = this.teamMat;
    (this.head.material as any) = this.teamMat;
    const gm = new StandardMaterial(`rp_gunmat_${id}`, scene);
    gm.diffuseColor = new Color3(0.15, 0.15, 0.18);
    this.gun.material = gm;
  }

  onSnapshot(s: PlayerState) {
    this.prev = this.curr;
    this.curr = s;
  }

  render(interpT: number) {
    if (!this.curr) return;
    const s = this.curr;
    let x = s.x, y = s.y, z = s.z, yaw = s.yaw, pitch = s.pitch;
    if (this.prev) {
      const t = Math.max(0, Math.min(1, interpT));
      x = this.prev.x + (s.x - this.prev.x) * t;
      y = this.prev.y + (s.y - this.prev.y) * t;
      z = this.prev.z + (s.z - this.prev.z) * t;
      let dy = s.yaw - this.prev.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      yaw = this.prev.yaw + dy * t;
      pitch = this.prev.pitch + (s.pitch - this.prev.pitch) * t;
    }
    // 身体中心：server y 是 bottom，mesh 原点在 center，故 +HEIGHT/2
    this.root.position.set(x, y + C.PLAYER.HEIGHT / 2 - C.PLAYER.RADIUS, z);
    this.body.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
    this.head.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
    this.root.setEnabled(s.alive);
  }

  dispose() { this.root.dispose(false, true); }
}
