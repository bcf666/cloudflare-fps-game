import { GAME_CONSTANTS } from '@shared/constants';
import { ServerPlayer } from './ServerPlayer';
import type { BulletState } from '@shared/protocol';

const C = GAME_CONSTANTS;

export class ServerBullet {
  static nextId = 1;
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ownerId: string;
  life: number;
  hitSomething = false;

  constructor(x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number, ownerId: string) {
    this.id = ServerBullet.nextId++;
    this.x = x; this.y = y; this.z = z;
    const speed = C.WEAPON.BULLET_SPEED;
    this.vx = dirX * speed; this.vy = dirY * speed; this.vz = dirZ * speed;
    this.ownerId = ownerId;
    this.life = C.WEAPON.BULLET_LIFETIME_S;
  }

  tick(dt: number, players: ServerPlayer[]): { hit: ServerPlayer | null } {
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.life -= dt;
    if (this.life <= 0) { this.hitSomething = true; return { hit: null }; }
    const half = C.MAP.SIZE / 2;
    if (this.x < -half || this.x > half || this.z < -half || this.z > half || this.y < 0 || this.y > 30) {
      this.hitSomething = true; return { hit: null };
    }
    for (const p of players) {
      if (!p.alive || p.id === this.ownerId) continue;
      const dx = this.x - p.x, dz = this.z - p.z;
      const dy = this.y - (p.y); // AABB center
      if (Math.abs(dx) < C.PLAYER.RADIUS && Math.abs(dz) < C.PLAYER.RADIUS &&
          Math.abs(dy) < C.PLAYER.HEIGHT / 2) {
        this.hitSomething = true;
        return { hit: p };
      }
    }
    return { hit: null };
  }

  toState(): BulletState {
    return {
      id: this.id, x: this.x, y: this.y, z: this.z,
      dx: this.vx, dy: this.vy, dz: this.vz, ownerId: this.ownerId,
    };
  }
}
