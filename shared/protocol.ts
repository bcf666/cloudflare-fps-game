// 消息类型字节码
export enum MsgType {
  // C2S
  JoinRoom = 0x01,
  Input = 0x02,
  // S2C
  Welcome = 0x10,
  PlayerJoin = 0x11,
  PlayerLeave = 0x12,
  StateSnapshot = 0x13,
  HitEvent = 0x14,
  KillEvent = 0x15,
  GameStart = 0x16,
  GameEnd = 0x17,
}

export interface PlayerState {
  id: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  hp: number;
  ammo: number;
  reloading: boolean;
  team: 'A' | 'B';
  alive: boolean;
}

export interface BulletState {
  id: number;
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  ownerId: string;
}

// ========= 序列化工具 =========
export class Writer {
  private view: DataView;
  private arr: Uint8Array;
  private offset = 0;
  constructor(size = 2048) {
    this.arr = new Uint8Array(size);
    this.view = new DataView(this.arr.buffer);
  }
  u8(v: number) { this.view.setUint8(this.offset, v); this.offset += 1; }
  u16(v: number) { this.view.setUint16(this.offset, v, true); this.offset += 2; }
  u32(v: number) { this.view.setUint32(this.offset, v, true); this.offset += 4; }
  f32(v: number) { this.view.setFloat32(this.offset, v, true); this.offset += 4; }
  str(v: string) {
    const bytes = new TextEncoder().encode(v);
    this.u16(bytes.length);
    this.arr.set(bytes, this.offset);
    this.offset += bytes.length;
  }
  bytes() { return this.arr.slice(0, this.offset); }
}

export class Reader {
  private view: DataView;
  private offset = 0;
  constructor(buf: ArrayBuffer | Uint8Array) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u8() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  u16() { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  u32() { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  f32() { const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v; }
  str() {
    const len = this.u16();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return new TextDecoder().decode(bytes);
  }
}

// ========= 消息序列化函数 =========
export function encodeInput(seq: number, moveX: number, moveZ: number, jump: boolean,
  yaw: number, pitch: number, shooting: boolean, reload: boolean): Uint8Array {
  const w = new Writer(32);
  w.u8(MsgType.Input); w.u32(seq);
  w.f32(moveX); w.f32(moveZ); w.u8(jump ? 1 : 0);
  w.f32(yaw); w.f32(pitch);
  w.u8(shooting ? 1 : 0); w.u8(reload ? 1 : 0);
  return w.bytes();
}

export function encodeJoinRoom(roomId: string): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.JoinRoom); w.str(roomId);
  return w.bytes();
}

export function encodeWelcome(playerId: string, team: 'A' | 'B'): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.Welcome); w.str(playerId); w.str(team);
  return w.bytes();
}

export function encodePlayerJoin(id: string, team: 'A' | 'B', name: string): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.PlayerJoin); w.str(id); w.str(team); w.str(name);
  return w.bytes();
}

export function encodePlayerLeave(id: string): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.PlayerLeave); w.str(id);
  return w.bytes();
}

export function encodeStateSnapshot(tick: number, players: PlayerState[],
  bullets: BulletState[], scoreA: number, scoreB: number, timeLeft: number): Uint8Array {
  const w = new Writer(4096);
  w.u8(MsgType.StateSnapshot); w.u32(tick);
  w.u8(players.length);
  for (const p of players) {
    w.str(p.id); w.f32(p.x); w.f32(p.y); w.f32(p.z);
    w.f32(p.yaw); w.f32(p.pitch); w.u16(p.hp); w.u8(p.ammo);
    w.u8(p.reloading ? 1 : 0); w.str(p.team); w.u8(p.alive ? 1 : 0);
  }
  w.u8(bullets.length);
  for (const b of bullets) {
    w.u32(b.id); w.f32(b.x); w.f32(b.y); w.f32(b.z);
    w.f32(b.dx); w.f32(b.dy); w.f32(b.dz); w.str(b.ownerId);
  }
  w.u16(scoreA); w.u16(scoreB); w.f32(timeLeft);
  return w.bytes();
}

export function encodeHitEvent(victimId: string, damage: number, shooterId: string): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.HitEvent); w.str(victimId); w.u8(damage); w.str(shooterId);
  return w.bytes();
}

export function encodeKillEvent(killerId: string, victimId: string): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.KillEvent); w.str(killerId); w.str(victimId);
  return w.bytes();
}

export function encodeGameStart(): Uint8Array {
  const w = new Writer(1); w.u8(MsgType.GameStart); return w.bytes();
}

export function encodeGameEnd(winner: 'A' | 'B' | 'draw', scoreA: number, scoreB: number): Uint8Array {
  const w = new Writer();
  w.u8(MsgType.GameEnd); w.str(winner); w.u16(scoreA); w.u16(scoreB);
  return w.bytes();
}

// 解码第一个字节类型 + Reader
export function decodeMessage(data: ArrayBuffer | Uint8Array): { type: MsgType; r: Reader } {
  const r = new Reader(data);
  return { type: r.u8() as MsgType, r };
}
