interface Env {
  FPS_SERVER: Fetcher; // service binding → fps-game-server Worker
  ASSETS?: Fetcher; // Pages static assets
}

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

    // Proxy API + WS to the Worker via service binding
    if (url.pathname.startsWith('/ws/') || url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return env.FPS_SERVER.fetch(req);
    }

    // Everything else → static assets (Pages)
    if (env.ASSETS) {
      return env.ASSETS.fetch(req);
    }
    return new Response('Not Found', { status: 404 });
  },
};
