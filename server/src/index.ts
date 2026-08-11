import { RoomDO } from './RoomDO';

export { RoomDO };

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS?: Fetcher; // Pages _worker.js 模式下的静态资源绑定
}

function roomNameFor(id: string) { return id.replace(/[^a-zA-Z0-9]/g, '_'); }

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 1. WebSocket 路由: /ws/:roomId
    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.slice('/ws/'.length) || 'default';
      const id = env.ROOM.idFromName(roomNameFor(roomId));
      const stub = env.ROOM.get(id);
      return stub.fetch(req);
    }
    // 2. 快速匹配 API
    if (url.pathname === '/api/matchmaking/quick' && req.method === 'POST') {
      const roomId = 'default';
      return new Response(JSON.stringify({ roomId, wsUrl: `/ws/${roomId}` }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // 3. 创建/查询房间信息
    if (url.pathname.startsWith('/api/room/')) {
      const roomId = url.pathname.slice('/api/room/'.length) || 'default';
      const id = env.ROOM.idFromName(roomNameFor(roomId));
      const stub = env.ROOM.get(id);
      const resp = await stub.fetch(req);
      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...Object.fromEntries(resp.headers) },
      });
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Pages _worker.js 模式：非 API 请求 fallback 到静态资源
    if (env.ASSETS) {
      return env.ASSETS.fetch(req);
    }
    return new Response('FPS Server OK', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  },
};
