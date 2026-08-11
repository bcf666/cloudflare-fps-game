import { GAME_CONSTANTS } from '@shared/constants';
import { ServerGameState } from './game/ServerGameState';
import {
  MsgType, decodeMessage, encodeWelcome, encodePlayerJoin, encodePlayerLeave,
} from '@shared/protocol';

interface Client {
  id: string;
  name: string;
  ws: WebSocket;
  joined: boolean;
  closed: boolean;
}

export class RoomDO {
  state: DurableObjectState;
  env: any;
  game = new ServerGameState();
  clients = new Map<string, Client>();
  private tickTimer: any = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state; this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/ws/')) {
      return this.handleWebSocket(req);
    }
    if (url.pathname.startsWith('/api/room/')) {
      return Response.json({
        phase: this.game.phase,
        players: this.game.players.size,
        max: GAME_CONSTANTS.GAME.MAX_PLAYERS,
        scoreA: this.game.teams.scores.A,
        scoreB: this.game.teams.scores.B,
        timeLeft: Math.max(0, this.game.timeLeft),
      });
    }
    return new Response('Room DO', { status: 200 });
  }

  private handleWebSocket(req: Request): Response {
    const upgradeHeader = req.headers.get('Upgrade') || '';
    if (!upgradeHeader.includes('websocket')) return new Response('Expected WS', { status: 400 });
    const pair = new WebSocketPair();
    const clientWs = pair[0];
    const serverWs = pair[1];
    serverWs.accept();

    const clientId = crypto.randomUUID();
    const client: Client = {
      id: clientId,
      name: 'Player_' + clientId.slice(0, 5),
      ws: serverWs as any,
      joined: false,
      closed: false,
    };
    this.clients.set(clientId, client);

    (serverWs as any).addEventListener('message', (msg: MessageEvent) => {
      this.onMessage(client, msg.data).catch(e => console.error('msg err', e));
    });
    (serverWs as any).addEventListener('close', () => { this.onClose(clientId); });
    (serverWs as any).addEventListener('error', () => { this.onClose(clientId); });

    this.maybeStartTick();
    return new Response(null, { status: 101, webSocket: clientWs });
  }

  private async onMessage(client: Client, data: any) {
    if (client.closed) return;
    if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) return;
    try {
      const { type, r } = decodeMessage(data as any);
      if (type === MsgType.JoinRoom) {
        r.str(); // roomId
        if (!client.joined) {
          if (this.game.players.size >= GAME_CONSTANTS.GAME.MAX_PLAYERS) {
            client.ws.close?.(1013, 'Room full');
            return;
          }
          const { team } = this.game.addPlayer(client.id, client.name);
          client.joined = true;
          this.send(client, encodeWelcome(client.id, team));
          this.broadcast(encodePlayerJoin(client.id, team, client.name), client.id);
          for (const p of this.game.players.values()) {
            if (p.id !== client.id) {
              this.send(client, encodePlayerJoin(p.id, p.team, p.name));
            }
          }
        }
      } else if (type === MsgType.Input) {
        if (!client.joined) return;
        const seq = r.u32();
        const moveX = r.f32(), moveZ = r.f32(), jump = !!r.u8();
        const yaw = r.f32(), pitch = r.f32();
        const shooting = !!r.u8(), reload = !!r.u8();
        this.game.applyInput(client.id, { seq, moveX, moveZ, jump, yaw, pitch, shooting, reload });
      }
    } catch (e) { console.error('decode err', e); }
  }

  private onClose(clientId: string) {
    const c = this.clients.get(clientId);
    if (!c) return;
    c.closed = true;
    this.clients.delete(clientId);
    this.game.removePlayer(clientId);
    this.broadcast(encodePlayerLeave(clientId));
    if (this.clients.size === 0 && this.tickTimer) {
      clearInterval(this.tickTimer); this.tickTimer = null;
    }
  }

  private maybeStartTick() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      try {
        this.game.doTick(Date.now());
        const snap = this.game.buildSnapshot();
        this.broadcastBytes(snap);
        while (this.game.events.length) {
          const ev = this.game.events.shift()!;
          this.broadcastBytes(ev.data);
        }
      } catch (e) { console.error('tick err', e); }
    }, 1000 / GAME_CONSTANTS.NETWORK.TICK_HZ);
  }

  private send(client: Client, data: Uint8Array) {
    if (client.closed) return;
    try { (client.ws as any).send(data); } catch {}
  }

  private broadcastBytes(data: Uint8Array) {
    for (const c of this.clients.values()) this.send(c, data);
  }

  private broadcast(data: Uint8Array, exceptId?: string) {
    for (const c of this.clients.values()) {
      if (exceptId && c.id === exceptId) continue;
      this.send(c, data);
    }
  }
}
