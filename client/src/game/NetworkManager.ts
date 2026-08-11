import {
  MsgType, decodeMessage, encodeJoinRoom, encodeInput,
  PlayerState, BulletState
} from '@shared/protocol';
import { GAME_CONSTANTS, Team } from '@shared/constants';

export interface Snapshot {
  tick: number;
  receivedAt: number;
  players: PlayerState[];
  bullets: BulletState[];
  scoreA: number; scoreB: number; timeLeft: number;
}

export class NetworkManager {
  ws: WebSocket | null = null;
  connected = false;
  roomId: string | null = null;

  onWelcome: (id: string, team: Team) => void = () => {};
  onPlayerJoin: (id: string, team: Team, name: string) => void = () => {};
  onPlayerLeave: (id: string) => void = () => {};
  onSnapshot: (snap: Snapshot) => void = () => {};
  onHit: (victimId: string, damage: number, shooterId: string) => void = () => {};
  onKill: (killerId: string, victimId: string) => void = () => {};
  onGameStart: () => void = () => {};
  onGameEnd: (winner: 'A' | 'B' | 'draw', scoreA: number, scoreB: number) => void = () => {};

  private inputSeq = 0;
  private sendTimer = 0;
  private welcomeDone = false;

  connect(wsPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let url: string;
      // 已经是绝对 WebSocket URL（ws:// 或 wss://）直接用
      if (wsPath.startsWith('ws://') || wsPath.startsWith('wss://')) {
        url = wsPath;
      } else {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${proto}//${location.host}${wsPath}`;
        if (!location.host || location.protocol === 'file:') {
          url = `ws://localhost:8787${wsPath}`;
        }
      }
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
      this.welcomeDone = false;
      const t = setTimeout(() => reject(new Error('连接超时，请检查服务器是否运行')), 8000);
      this.ws.onopen = () => {
        clearTimeout(t);
        this.connected = true;
        const roomId = wsPath.split('/').filter(Boolean).pop() || 'default';
        this.send(encodeJoinRoom(roomId));
        this.roomId = roomId;
        // 发送输入
        if (this.sendTimer) clearInterval(this.sendTimer);
        this.sendTimer = window.setInterval(() => {
          if (this.connected && this._lastInput) {
            this._lastInput.seq = ++this.inputSeq;
            this.send(encodeInput(
              this._lastInput.seq,
              this._lastInput.moveX, this._lastInput.moveZ, this._lastInput.jump,
              this._lastInput.yaw, this._lastInput.pitch,
              this._lastInput.shooting, this._lastInput.reload,
            ));
            this._lastInput.reload = false;
          }
        }, 1000 / 60);
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(t);
        reject(new Error('WebSocket 连接失败'));
      };
      this.ws.addEventListener('message', (e) => this.onMessage(e.data));
      this.ws.addEventListener('close', () => {
        this.connected = false;
        if (this.sendTimer) { clearInterval(this.sendTimer); this.sendTimer = 0; }
      });
    });
  }

  close() {
    if (this.sendTimer) { clearInterval(this.sendTimer); this.sendTimer = 0; }
    try { this.ws?.close(); } catch {}
    this.ws = null; this.connected = false; this.welcomeDone = false;
  }

  private _lastInput = {
    seq: 0, moveX: 0, moveZ: 0, jump: false,
    yaw: 0, pitch: 0, shooting: false, reload: false,
  };

  // 返回上一帧是否在射击（用于触发客户端枪口火焰）
  setInput(partial: Partial<typeof this._lastInput>): boolean {
    const wasShooting = this._lastInput.shooting;
    Object.assign(this._lastInput, partial);
    return wasShooting;
  }

  getLastInput() { return { ...this._lastInput }; }

  send(data: Uint8Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(data); } catch {}
    }
  }

  private onMessage(data: ArrayBuffer) {
    try {
      const { type, r } = decodeMessage(data);
      switch (type) {
        case MsgType.Welcome: {
          const id = r.str(); const team = r.str() as Team;
          if (!this.welcomeDone) {
            this.welcomeDone = true;
            this.onWelcome(id, team);
          } else {
            // 重复 welcome => 忽略
          }
          break;
        }
        case MsgType.PlayerJoin: {
          const id = r.str(); const team = r.str() as Team; const name = r.str();
          this.onPlayerJoin(id, team, name); break;
        }
        case MsgType.PlayerLeave: {
          this.onPlayerLeave(r.str()); break;
        }
        case MsgType.StateSnapshot: {
          const tick = r.u32();
          const pCount = r.u8();
          const players: PlayerState[] = [];
          for (let i = 0; i < pCount; i++) {
            players.push({
              id: r.str(), x: r.f32(), y: r.f32(), z: r.f32(),
              yaw: r.f32(), pitch: r.f32(), hp: r.u16(), ammo: r.u8(),
              reloading: !!r.u8(), team: r.str() as Team, alive: !!r.u8(),
            });
          }
          const bCount = r.u8();
          const bullets: BulletState[] = [];
          for (let i = 0; i < bCount; i++) {
            bullets.push({
              id: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(),
              dx: r.f32(), dy: r.f32(), dz: r.f32(), ownerId: r.str(),
            });
          }
          const scoreA = r.u16(), scoreB = r.u16();
          const timeLeft = r.f32();
          this.onSnapshot({
            tick, receivedAt: performance.now(),
            players, bullets, scoreA, scoreB, timeLeft,
          });
          break;
        }
        case MsgType.HitEvent: {
          const v = r.str(); const d = r.u8(); const s = r.str();
          this.onHit(v, d, s); break;
        }
        case MsgType.KillEvent: {
          const k = r.str(); const v = r.str();
          this.onKill(k, v); break;
        }
        case MsgType.GameStart: {
          this.onGameStart(); break;
        }
        case MsgType.GameEnd: {
          const w = r.str() as any; const a = r.u16(); const b = r.u16();
          this.onGameEnd(w, a, b); break;
        }
      }
    } catch (e) { console.error('net decode err', e); }
  }
}
