import { BabylonInstance } from './BabylonInstance';
import { NetworkManager, Snapshot } from './NetworkManager';
import { PlayerController } from './PlayerController';
import { RemotePlayer } from './RemotePlayer';
import { WeaponRenderer } from './WeaponRenderer';
import { BulletRenderer } from './BulletRenderer';
import {
  Scene, Vector3, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, ShadowGenerator,
  UniversalCamera, Quaternion, Mesh
} from '@babylonjs/core';
import { GAME_CONSTANTS, Team } from '@shared/constants';
import type { PlayerState } from '@shared/protocol';

const C = GAME_CONSTANTS;

interface Opts {
  myPlayerId: string;
  myTeam: Team;
  net: NetworkManager;
}

export class GameScene {
  babylon: BabylonInstance;
  net: NetworkManager;
  scene: Scene;
  camera: UniversalCamera;
  controller: PlayerController;
  weapon: WeaponRenderer;
  bulletRenderer: BulletRenderer;

  myPlayerId: string;
  myTeam: Team;

  remotes = new Map<string, RemotePlayer>();
  private knownPlayers = new Map<string, { team: Team; name: string }>();

  private snapBuffer: Snapshot[] = [];
  private lastT = performance.now();

  private lastAmmo: number = C.WEAPON.MAG_SIZE;

  onMyHpChange: (hp: number) => void = () => {};
  onMyAmmoChange: (ammo: number, reloading: boolean) => void = () => {};
  onScoreChange: (a: number, b: number, timeLeft: number) => void = () => {};
  onHit: (damage: number) => void = () => {};
  onKill: (killer: string, victim: string) => void = () => {};

  private _renderToken: any;
  private _disposed = false;

  constructor(babylon: BabylonInstance, opts: Opts) {
    this.babylon = babylon; this.net = opts.net;
    this.myPlayerId = opts.myPlayerId; this.myTeam = opts.myTeam;
    this.scene = babylon.scene;

    this.clearScene();
    this.buildMap();

    this.camera = new UniversalCamera('cam', new Vector3(0, C.PLAYER.EYE_HEIGHT, 0), this.scene);
    this.camera.fov = 1.12;
    this.camera.minZ = 0.03;
    this.scene.activeCamera = this.camera;

    this.controller = new PlayerController(this.babylon.canvas, this.net);
    this.weapon = new WeaponRenderer(this.scene, this.camera);
    this.bulletRenderer = new BulletRenderer(this.scene);

    this.net.onPlayerJoin = (id, team, name) => { this.knownPlayers.set(id, { team, name }); };
    this.net.onPlayerLeave = (id) => { this.removeRemote(id); this.knownPlayers.delete(id); };
    this.net.onSnapshot = (s) => this.pushSnapshot(s);
    this.net.onHit = (victimId, dmg) => { if (victimId === this.myPlayerId) this.onHit(dmg); };
    this.net.onKill = (killerId, victimId) => this.onKill(killerId, victimId);

    this._renderToken = () => this.render();
    this.scene.registerBeforeRender(this._renderToken);
  }

  private clearScene() {
    const meshes: Mesh[] = [];
    this.scene.meshes.forEach(m => { if (!m.isDisposed()) meshes.push(m as Mesh); });
    for (const m of meshes) try { m.dispose(false, true); } catch {}
    const lights: any[] = [];
    this.scene.lights.forEach(l => lights.push(l));
    for (const l of lights) try { l.dispose(); } catch {}
    this.scene.clearColor = new Color4(0.06, 0.07, 0.13, 1);
  }

  private buildMap() {
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new Color3(0.08, 0.1, 0.15);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), this.scene);
    sun.intensity = 0.9;
    sun.position = new Vector3(15, 30, 15);
    const sg = new ShadowGenerator(1024, sun);
    sg.useBlurCloseExponentialShadowMap = true;
    sg.blurScale = 2;
    sg.bias = 0.0005;

    const S = C.MAP.SIZE;
    const ground = MeshBuilder.CreateGround('ground', { width: S, height: S, subdivisions: 1 }, this.scene);
    const gMat = new StandardMaterial('gmat', this.scene);
    gMat.diffuseColor = new Color3(0.16, 0.18, 0.22);
    gMat.specularColor = new Color3(0.02, 0.02, 0.02);
    ground.material = gMat;
    ground.receiveShadows = true;
    sg.addShadowCaster(ground);

    const wallMat = new StandardMaterial('wallmat', this.scene);
    wallMat.diffuseColor = new Color3(0.24, 0.25, 0.3);
    wallMat.specularColor = new Color3(0.02, 0.02, 0.03);
    const wallH = C.MAP.WALL_HEIGHT;
    const walls = [
      { x: 0, z: -S / 2, w: S, d: 0.6 },
      { x: 0, z: S / 2, w: S, d: 0.6 },
      { x: -S / 2, z: 0, w: 0.6, d: S },
      { x: S / 2, z: 0, w: 0.6, d: S },
    ];
    for (const w of walls) {
      const m = MeshBuilder.CreateBox('wall', { width: w.w, height: wallH, depth: w.d }, this.scene);
      m.position.set(w.x, wallH / 2, w.z);
      m.material = wallMat;
      m.receiveShadows = true;
      sg.addShadowCaster(m);
    }

    // 出生点标识：左蓝右红地光
    const teamGlowMatA = new StandardMaterial('glowA', this.scene);
    teamGlowMatA.emissiveColor = new Color3(0.1, 0.2, 0.6);
    teamGlowMatA.diffuseColor = new Color3(0.05, 0.1, 0.3);
    const teamGlowMatB = new StandardMaterial('glowB', this.scene);
    teamGlowMatB.emissiveColor = new Color3(0.6, 0.1, 0.2);
    teamGlowMatB.diffuseColor = new Color3(0.3, 0.05, 0.08);
    const spawnMarker = (x: number, z: number, mat: StandardMaterial) => {
      const r = MeshBuilder.CreateDisc('spawn', { radius: 1.2, tessellation: 24 }, this.scene);
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.02, z);
      r.material = mat;
    };
    const spawnsA = [
      { x: -S / 2 + 5, z: -8 }, { x: -S / 2 + 5, z: 0 }, { x: -S / 2 + 5, z: 8 },
    ];
    const spawnsB = [
      { x: S / 2 - 5, z: -8 }, { x: S / 2 - 5, z: 0 }, { x: S / 2 - 5, z: 8 },
    ];
    spawnsA.forEach(s => spawnMarker(s.x, s.z, teamGlowMatA));
    spawnsB.forEach(s => spawnMarker(s.x, s.z, teamGlowMatB));

    const coverMat = new StandardMaterial('cover', this.scene);
    coverMat.diffuseColor = new Color3(0.42, 0.35, 0.28);
    coverMat.specularColor = new Color3(0.03, 0.03, 0.02);
    const obs = [
      { x: 0, z: 0, w: 8, d: 2 },
      { x: 0, z: 0, w: 2, d: 8 },
      { x: -12, z: -12, w: 3, d: 3 },
      { x: 12, z: -12, w: 3, d: 3 },
      { x: -12, z: 12, w: 3, d: 3 },
      { x: 12, z: 12, w: 3, d: 3 },
    ];
    for (const o of obs) {
      const m = MeshBuilder.CreateBox('cover', { width: o.w, height: 1.8, depth: o.d }, this.scene);
      m.position.set(o.x, 0.9, o.z);
      m.material = coverMat;
      m.receiveShadows = true;
      sg.addShadowCaster(m);
    }
  }

  private pushSnapshot(s: Snapshot) {
    this.snapBuffer.push(s);
    if (this.snapBuffer.length > 10) this.snapBuffer.shift();
    this.onScoreChange(s.scoreA, s.scoreB, s.timeLeft);
    const me = s.players.find(p => p.id === this.myPlayerId);
    if (me) {
      this.onMyHpChange(me.hp);
      this.onMyAmmoChange(me.ammo, me.reloading);
      // ammo 减少说明射击成功 → 触发枪口火焰
      if (me.ammo < this.lastAmmo) this.weapon.showMuzzleFlash();
      this.lastAmmo = me.ammo;
    }
  }

  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (r) { r.dispose(); this.remotes.delete(id); }
  }

  private render() {
    if (this._disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    const { prevShooting } = this.controller.update();

    // 插值时间点：延迟 100ms
    const target = now - C.NETWORK.INTERP_DELAY_MS;
    let p: Snapshot | null = null, q: Snapshot | null = null;
    for (let i = 1; i < this.snapBuffer.length; i++) {
      if (this.snapBuffer[i - 1].receivedAt <= target && this.snapBuffer[i].receivedAt >= target) {
        p = this.snapBuffer[i - 1]; q = this.snapBuffer[i]; break;
      }
    }
    let interp = 1;
    let snap: Snapshot | null = null;
    if (p && q) {
      const span = q.receivedAt - p.receivedAt + 1e-6;
      const t = (target - p.receivedAt) / span;
      interp = Math.max(0, Math.min(1, t));
      snap = q;
    } else if (this.snapBuffer.length) {
      snap = this.snapBuffer[this.snapBuffer.length - 1];
      interp = 1;
    }

    if (snap) {
      const me = snap.players.find(pp => pp.id === this.myPlayerId);
      let walking = false;
      if (me && me.alive) {
        const camY = me.y + C.PLAYER.EYE_HEIGHT - C.PLAYER.HEIGHT / 2;
        // 本地 yaw/pitch（来自控制器），避免延迟带来的晕动
        this.camera.position.set(me.x, camY, me.z);
        this.camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(
          this.controller.yaw, this.controller.pitch, 0,
        );
        const inp = this.net.getLastInput();
        walking = Math.abs(inp.moveX) + Math.abs(inp.moveZ) > 0.1;
      } else if (me && !me.alive) {
        // 死亡视角：拉高+俯视地图中心
        const t = (Date.now() / 2000) % 1;
        this.camera.position.set(Math.cos(t * Math.PI * 2) * 20, 24, Math.sin(t * Math.PI * 2) * 20);
        this.camera.setTarget(new Vector3(0, 1, 0));
      }
      this.weapon.update(dt, prevShooting, !!me?.reloading, walking && !!me?.alive);

      // 远端玩家
      const stillAlive = new Set<string>();
      for (const ps of snap.players) {
        if (ps.id === this.myPlayerId) continue;
        stillAlive.add(ps.id);
        let r = this.remotes.get(ps.id);
        if (!r) {
          const known = this.knownPlayers.get(ps.id);
          const team = known?.team ?? ps.team;
          const name = known?.name ?? ('Player_' + ps.id.slice(0, 5));
          r = new RemotePlayer(ps.id, team, name, this.scene);
          this.remotes.set(ps.id, r);
        }
        if (p) {
          const prevP = p.players.find(x => x.id === ps.id);
          if (prevP) r.onSnapshot(prevP);
        }
        r.onSnapshot(ps);
        r.render(interp);
      }
      for (const id of Array.from(this.remotes.keys())) {
        if (!stillAlive.has(id)) this.removeRemote(id);
      }
      this.bulletRenderer.update(snap.bullets, dt);
    }
  }

  dispose() {
    this._disposed = true;
    try {
      if (this._renderToken) this.scene.unregisterBeforeRender(this._renderToken);
    } catch {}
    this.weapon.dispose();
    this.bulletRenderer.dispose();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.snapBuffer = [];
  }
}
