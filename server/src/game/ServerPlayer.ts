import { GAME_CONSTANTS, Team } from '@shared/constants';
import type { PlayerState } from '@shared/protocol';

const C = GAME_CONSTANTS;

export interface InputFrame {
  seq: number;
  moveX: number; moveZ: number; jump: boolean;
  yaw: number; pitch: number;
  shooting: boolean; reload: boolean;
}

export interface Obstacle { x: number; z: number; w: number; d: number; }

export class ServerPlayer {
  id: string;
  team: Team;
  name: string;

  x = 0; y = C.PLAYER.HEIGHT / 2; z = 0;
  yaw = 0; pitch = 0;
  vx = 0; vy = 0; vz = 0;
  onGround = false;

  hp = C.PLAYER.MAX_HP;
  ammo = C.WEAPON.MAG_SIZE;
  reloading = false;
  alive = true;

  private reloadStartT = 0;
  private lastFireT = 0;
  respawnAt = 0;

  lastInputSeq = -1;
  pendingInput: InputFrame | null = null;
  // 当前 tick 处理后的射击状态，用于触发火焰（通过 state snapshot ammo 递减暴露给客户端）
  firedThisTick = false;

  constructor(id: string, team: Team, spawn: { x: number; z: number }, name: string) {
    this.id = id; this.team = team; this.name = name;
    this.x = spawn.x; this.z = spawn.z;
  }

  applyInput(input: InputFrame) {
    if (input.seq <= this.lastInputSeq) return;
    this.lastInputSeq = input.seq;
    this.pendingInput = input;
    this.yaw = input.yaw;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, input.pitch));
  }

  tick(dt: number, now: number, obstacles: Obstacle[]): boolean {
    this.firedThisTick = false;
    if (!this.alive) {
      if (now >= this.respawnAt) this.respawn();
      return false;
    }
    if (this.reloading && now - this.reloadStartT >= C.WEAPON.RELOAD_TIME_S * 1000) {
      this.reloading = false;
      this.ammo = C.WEAPON.MAG_SIZE;
    }

    if (this.pendingInput) {
      const inp = this.pendingInput;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      let dirX = inp.moveZ * sin + inp.moveX * cos;
      let dirZ = inp.moveZ * cos - inp.moveX * sin;
      const len = Math.hypot(dirX, dirZ);
      if (len > 1e-6) { dirX /= len; dirZ /= len; }
      this.vx = dirX * C.PLAYER.SPEED;
      this.vz = dirZ * C.PLAYER.SPEED;
      if (inp.jump && this.onGround) { this.vy = C.PLAYER.JUMP_VELOCITY; this.onGround = false; }
      if (inp.reload && !this.reloading && this.ammo < C.WEAPON.MAG_SIZE) {
        this.reloading = true; this.reloadStartT = now;
      }
    } else {
      this.vx *= 0.6; this.vz *= 0.6;
    }

    this.vy -= C.PLAYER.GRAVITY * dt;

    let newX = this.x + this.vx * dt;
    if (!this.collidesX(newX, this.z, obstacles)) this.x = newX;
    let newZ = this.z + this.vz * dt;
    if (!this.collidesZ(this.x, newZ, obstacles)) this.z = newZ;
    const half = C.MAP.SIZE / 2 - C.PLAYER.RADIUS;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.z = Math.max(-half, Math.min(half, this.z));

    this.y += this.vy * dt;
    if (this.y <= C.PLAYER.HEIGHT / 2) {
      this.y = C.PLAYER.HEIGHT / 2; this.vy = 0; this.onGround = true;
    }

    let shouldFire = false;
    if (this.pendingInput?.shooting && !this.reloading && this.ammo > 0 &&
        now - this.lastFireT >= C.WEAPON.FIRE_RATE_MS) {
      shouldFire = true;
      this.firedThisTick = true;
      this.lastFireT = now;
      this.ammo--;
    }
    this.pendingInput = null;
    return shouldFire;
  }

  private collidesX(nx: number, nz: number, obs: Obstacle[]): boolean {
    for (const o of obs) {
      if (nx + C.PLAYER.RADIUS > o.x - o.w / 2 && nx - C.PLAYER.RADIUS < o.x + o.w / 2 &&
          nz + C.PLAYER.RADIUS > o.z - o.d / 2 && nz - C.PLAYER.RADIUS < o.z + o.d / 2) return true;
    }
    return false;
  }
  private collidesZ(nx: number, nz: number, obs: Obstacle[]): boolean {
    for (const o of obs) {
      if (nx + C.PLAYER.RADIUS > o.x - o.w / 2 && nx - C.PLAYER.RADIUS < o.x + o.w / 2 &&
          nz + C.PLAYER.RADIUS > o.z - o.d / 2 && nz - C.PLAYER.RADIUS < o.z + o.d / 2) return true;
    }
    return false;
  }

  takeDamage(dmg: number, now: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) { this.alive = false; this.respawnAt = now + C.PLAYER.RESPAWN_TIME * 1000; return true; }
    return false;
  }

  respawn() {
    this.alive = true; this.hp = C.PLAYER.MAX_HP; this.ammo = C.WEAPON.MAG_SIZE;
    this.reloading = false; this.vy = 0;
    this.x = this.team === 'A' ? -15 : 15;
    this.z = 0;
    this.y = C.PLAYER.HEIGHT / 2;
  }

  setSpawn(x: number, z: number) { this.x = x; this.z = z; }

  toState(): PlayerState {
    return {
      id: this.id, x: this.x, y: this.y, z: this.z,
      yaw: this.yaw, pitch: this.pitch, hp: Math.max(0, this.hp), ammo: this.ammo,
      reloading: this.reloading, team: this.team, alive: this.alive,
    };
  }
}
