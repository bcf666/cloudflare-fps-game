import { GAME_CONSTANTS, Team } from '@shared/constants';
import { ServerPlayer, Obstacle, InputFrame } from './ServerPlayer';
import { ServerBullet } from './ServerBullet';
import { TeamManager } from './TeamManager';
import {
  encodeStateSnapshot, encodeHitEvent, encodeKillEvent, encodeGameStart, encodeGameEnd,
  PlayerState, BulletState
} from '@shared/protocol';

const C = GAME_CONSTANTS;

export type GamePhase = 'waiting' | 'countdown' | 'playing' | 'ended';

export interface PendingEvent { data: Uint8Array; }

export class ServerGameState {
  players = new Map<string, ServerPlayer>();
  bullets: ServerBullet[] = [];
  teams = new TeamManager();
  phase: GamePhase = 'waiting';
  timeLeft = C.GAME.MATCH_DURATION_S;
  countdownLeft = C.GAME.COUNTDOWN_S;
  tick = 0;

  events: PendingEvent[] = [];

  obstacles: Obstacle[] = [];
  spawnsA: { x: number; z: number }[] = [];
  spawnsB: { x: number; z: number }[] = [];

  private lastTickT = 0;

  constructor() { this.buildMap(); }

  private buildMap() {
    const S = C.MAP.SIZE;
    this.obstacles = [
      { x: 0, z: 0, w: 8, d: 2 },
      { x: 0, z: 0, w: 2, d: 8 },
      { x: -12, z: -12, w: 3, d: 3 },
      { x: 12, z: -12, w: 3, d: 3 },
      { x: -12, z: 12, w: 3, d: 3 },
      { x: 12, z: 12, w: 3, d: 3 },
    ];
    this.spawnsA = [
      { x: -S / 2 + 5, z: -8 },
      { x: -S / 2 + 5, z: 0 },
      { x: -S / 2 + 5, z: 8 },
    ];
    this.spawnsB = [
      { x: S / 2 - 5, z: -8 },
      { x: S / 2 - 5, z: 0 },
      { x: S / 2 - 5, z: 8 },
    ];
  }

  addPlayer(id: string, name: string): { team: Team; spawn: { x: number; z: number } } {
    const team = this.teams.assignTeam();
    this.teams.onPlayerJoin(team);
    const spawns = team === 'A' ? this.spawnsA : this.spawnsB;
    // 根据当前该队已有人数选spawn，均匀分布
    let idx = 0;
    for (const p of this.players.values()) if (p.team === team) idx++;
    const spawn = spawns[idx % spawns.length];
    const p = new ServerPlayer(id, team, spawn, name);
    this.players.set(id, p);
    return { team, spawn };
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (p) { this.teams.onPlayerLeave(p.team); this.players.delete(id); }
  }

  applyInput(playerId: string, input: InputFrame) {
    const p = this.players.get(playerId);
    if (p) p.applyInput(input);
  }

  doTick(nowMs: number) {
    const now = nowMs;
    const dt = this.lastTickT ? Math.min(0.05, (now - this.lastTickT) / 1000) : 1 / C.NETWORK.TICK_HZ;
    this.lastTickT = now;
    this.tick++;

    if (this.phase === 'waiting') {
      if (this.players.size >= C.GAME.MIN_PLAYERS) {
        this.phase = 'countdown'; this.countdownLeft = C.GAME.COUNTDOWN_S;
      }
    } else if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      if (this.countdownLeft <= 0) {
        this.phase = 'playing'; this.timeLeft = C.GAME.MATCH_DURATION_S;
        // 重置击杀位置为正式出生点（之前在 waiting 阶段也有位置，这里确保大家在队伍出生区）
        for (const p of this.players.values()) {
          const sp = p.team === 'A' ? this.spawnsA : this.spawnsB;
          const s = sp[Math.floor(Math.random() * sp.length)];
          p.setSpawn(s.x, s.z);
          p.hp = C.PLAYER.MAX_HP; p.ammo = C.WEAPON.MAG_SIZE;
          p.alive = true; p.reloading = false;
        }
        this.teams.scores = { A: 0, B: 0 };
        this.events.push({ data: encodeGameStart() });
      }
    } else if (this.phase === 'playing') {
      this.timeLeft -= dt;
      for (const p of this.players.values()) {
        const fired = p.tick(dt, now, this.obstacles);
        if (fired) this.spawnBullet(p);
      }
      const playerArr = Array.from(this.players.values());
      for (const b of this.bullets) {
        const res = b.tick(dt, playerArr);
        if (res.hit) {
          const owner = this.players.get(b.ownerId);
          const died = res.hit.takeDamage(C.WEAPON.DAMAGE, now);
          this.events.push({ data: encodeHitEvent(res.hit.id, C.WEAPON.DAMAGE, b.ownerId) });
          if (died) {
            if (owner && owner.team !== res.hit.team) {
              this.teams.addKill(owner.team);
            }
            this.events.push({ data: encodeKillEvent(b.ownerId, res.hit.id) });
            const sp = (res.hit.team === 'A' ? this.spawnsA : this.spawnsB);
            const s = sp[Math.floor(Math.random() * sp.length)];
            res.hit.setSpawn(s.x, s.z);
          }
        }
      }
      this.bullets = this.bullets.filter(b => !b.hitSomething);

      if (this.timeLeft <= 0) {
        this.phase = 'ended';
        const sa = this.teams.scores.A, sb = this.teams.scores.B;
        const winner = sa > sb ? 'A' : sb > sa ? 'B' : 'draw';
        this.events.push({ data: encodeGameEnd(winner as any, sa, sb) });
      }
    } else if (this.phase === 'ended') {
      if (this.timeLeft <= -10) this.softResetForNextMatch();
    }
  }

  private spawnBullet(p: ServerPlayer) {
    const eyeY = p.y + C.PLAYER.EYE_HEIGHT - C.PLAYER.HEIGHT / 2;
    const spread = C.WEAPON.SPREAD_RAD;
    const sx = (Math.random() - 0.5) * spread;
    const sy = (Math.random() - 0.5) * spread;
    const cosPitch = Math.cos(p.pitch + sy);
    const dirX = Math.sin(p.yaw + sx) * cosPitch;
    const dirY = Math.sin(p.pitch + sy);
    const dirZ = Math.cos(p.yaw + sx) * cosPitch;
    const x = p.x + dirX * 0.8;
    const y = eyeY + dirY * 0.8;
    const z = p.z + dirZ * 0.8;
    this.bullets.push(new ServerBullet(x, y, z, dirX, dirY, dirZ, p.id));
  }

  buildSnapshot(): Uint8Array {
    const players: PlayerState[] = [];
    for (const p of this.players.values()) players.push(p.toState());
    const bullets: BulletState[] = this.bullets.map(b => b.toState());
    return encodeStateSnapshot(this.tick, players, bullets, this.teams.scores.A, this.teams.scores.B, this.timeLeft);
  }

  /** 结算后只重置分数、时间和死亡玩家，保持房间玩家列表 */
  private softResetForNextMatch() {
    this.teams.scores = { A: 0, B: 0 };
    this.bullets = [];
    this.phase = 'waiting';
    this.timeLeft = C.GAME.MATCH_DURATION_S;
    for (const p of this.players.values()) {
      const sp = p.team === 'A' ? this.spawnsA : this.spawnsB;
      const s = sp[Math.floor(Math.random() * sp.length)];
      p.setSpawn(s.x, s.z);
      p.hp = C.PLAYER.MAX_HP; p.ammo = C.WEAPON.MAG_SIZE; p.alive = true; p.reloading = false;
      p.vy = 0;
    }
  }

  reset() {
    this.teams.reset();
    this.players.clear();
    this.bullets = [];
    this.phase = 'waiting';
    this.timeLeft = C.GAME.MATCH_DURATION_S;
    this.events = [];
  }
}
