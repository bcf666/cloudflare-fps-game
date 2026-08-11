# Team FPS · 3D 联机网页游戏部署指南

一个基于 **Babylon.js + Cloudflare Workers + Durable Objects** 的 3D 团队对战 FPS，
可直接部署到 Cloudflare Pages + Workers，无需自建服务器。

## 📁 项目结构

```
/workspace
├── shared/              前后端共享代码
│   ├── constants.ts     游戏常量（速度/伤害/地图大小等）
│   └── protocol.ts      二进制网络协议 + 序列化
├── server/              Cloudflare Worker + Durable Object
│   ├── src/
│   │   ├── index.ts     Worker 入口（路由 /api /ws → DO）
│   │   ├── RoomDO.ts    Durable Object：房间/WS/30Hz tick 循环
│   │   └── game/        权威游戏状态/玩家/子弹/队伍
│   ├── wrangler.toml    DO 绑定配置
│   └── package.json
├── client/              前端 (Babylon.js + Vite)
│   ├── src/
│   │   ├── App.ts       应用状态机 (menu→lobby→play→result)
│   │   ├── game/        Babylon场景/控制器/远端玩家插值/武器/子弹
│   │   └── ui/          DOM UI (主菜单/大厅/HUD/结算)
│   ├── vite.config.ts
│   └── package.json
└── docs/superpowers/    设计文档 + 实施计划
```

## 🎮 本地开发

### 1. 安装依赖
```bash
# 分别安装
cd server && npm install
cd ../client && npm install
```

### 2. 启动开发服务器（两个终端并行）

终端 A（后端 Worker + DO，默认端口 8787）：
```bash
cd server
npm run dev
# 或者：npx wrangler dev src/index.ts --local --port 8787
```

终端 B（前端 Vite，默认端口 5173）：
```bash
cd client
npm run dev
```

浏览器访问 `http://localhost:5173`，开**两个标签页**就能进入同一房间组队对战。
Vite 已配置 `/api` 和 `/ws` 代理指向 `localhost:8787`。

### 3. 操作方式

| 键位 | 功能 |
|------|------|
| W / A / S / D | 移动 |
| Space | 跳跃 |
| 鼠标左键 | 射击（需先点击画面锁指针） |
| 鼠标移动 | 视角 |
| R | 换弹 |
| ESC | 解锁指针 |

---

## 🚀 部署到 Cloudflare

### 第 1 步：Cloudflare 账号 & Wrangler 登录

1. 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费即可使用 Workers + Pages 基础额度 + Durable Objects 10 万次/日免费）
2. 登录 Wrangler：
   ```bash
   cd server
   npx wrangler login
   # 按浏览器提示授权
   ```

### 第 2 步：部署 Server (Worker + Durable Object)

```bash
cd server
# 1. 编辑 wrangler.toml，填入你的 account_id（从 dash.cloudflare.com 右上角"获取账户 ID"）
#    或直接运行 deploy，wrangler 会提示选择账号

# 2. 首次部署（会自动创建 Worker 并注册 Durable Object 迁移）
npm run deploy
# 或者：npx wrangler deploy src/index.ts
```

成功后输出类似：
```
Published fps-game-server (0.52 sec)
  https://fps-game-server.your-subdomain.workers.dev
```

记下这个 Worker 域名。

### 第 3 步：构建 & 部署 Client (Cloudflare Pages)

**方式 A：Pages 直接上传（最快）**
```bash
cd client
npm run build
# 产物在 dist/

# 3a：用 wrangler CLI 部署到 Pages（需先在 dash 创建 Pages 项目）
npx wrangler pages deploy dist --project-name=team-fps --branch=main
```

**方式 B：绑定 Git 仓库自动部署（推荐）**
1. 把代码推到 GitHub/GitLab
2. Cloudflare Dashboard → **Workers & Pages** → **Create → Pages** → 连接 Git
3. 配置：
   - **构建命令**：`cd client && npm install && npm run build`
   - **构建输出目录**：`client/dist`
   - **Root Directory**：留空（项目根）
4. Save and Deploy

### 第 4 步：为 Pages 绑定 Durable Object（关键！）

Pages 需要能调用 `RoomDO` 这个 Durable Object，要做**跨服务绑定**：

1. Pages 项目 → **Settings** → **Functions** → **Durable Object bindings**
2. 点击 **Add binding**：
   - **Variable name**：`ROOM`（必须和 server/wrangler.toml 中 name 一致）
   - **Durable Object Class**：`RoomDO`
   - **Service**：选择刚才部署的 `fps-game-server` Worker
3. Save → Pages 会重新部署（无需重新构建）

### 第 5 步：可选 - 自定义域名

让 Pages 和 Worker 在**同一个子域名**上可以避免 CORS 和混合内容问题：

1. Cloudflare → 网站 → 你的域名 → **DNS** 添加记录 `game` → 代理到 Pages（Pages 会自动提供）
2. Pages → Custom domains → 添加 `game.yourdomain.com`
3. Worker → Triggers → Routes → 添加
   - Route: `game.yourdomain.com/api/*`
   - Route: `game.yourdomain.com/ws/*`
4. 把 `client/src/game/NetworkManager.ts` 里的 `url` 构造改为相对路径（已默认，直接用 `/ws/:roomId`）即可

### 第 6 步：验证

- 访问 Pages 域名 → 看主菜单 → 点快速匹配
- 开两个浏览器窗口（或手机+电脑）都访问同一地址 → 两边都进同一房间 → 倒计时结束开始对战

---

## 💸 成本 & Cloudflare 免费额度参考

- **Workers**：每日免费 10 万次请求 + 10 万次 Durable Object 调用，超出 $0.15/百万
- **Durable Object**：每 DO 实例空闲 30s 后卸载；活跃状态 $0.015/GB-秒（空闲 $0.00038/GB-秒）
- **Pages**：无限制带宽 + 每月 500 次构建
- 小范围开黑（<100人日活）几乎不会超出免费额度

> 生产建议：在 Cloudflare Rules → WAF 里为 `/ws/*` 和 `/api/*` 打开**速率限制**（Rate Limiting），
> 防止恶意刷连接耗尽 DO 额度。

---

## 🔧 常见问题

### Q: 本地开发一切正常，线上 WebSocket 连不上？
A: 1. 检查 Pages 是否正确绑定了 ROOM DO；2. 用 Safari 打开"开发→显示错误控制台"看 WebSocket 是否 CORS 被拦截；3. 同域名部署就不会有 CORS。

### Q: 画面加载黑屏？
A: 大概率浏览器禁用了 WebGL。Babylon.js 需要 WebGL2 支持（移动端基本都支持，桌面端老旧或定制浏览器除外）。

### Q: 为什么不做客户端预测？
A: 为保持实现简洁+防作弊，本 MVP 采用**服务器权威 + 客户端纯插值**（100ms 缓冲），手感上几乎感觉不到延迟，30Hz tick 足够流畅。

### Q: 怎么加多张地图、多种武器、自定义房间？
A:
- 多张地图：`shared/constants.ts` 导出多套 `obstacles/spawns`，`ServerGameState.buildMap(mapId)` 切换；客户端 GameScene 对应 build。
- 多种武器：`constants.ts` 增加 WEAPONS 数组，玩家切换时改 `C.WEAPON = 当前武器常量`，服务端 `ServerPlayer.firedThisTick` 里判定当前武器。
- 自定义房间：`Worker POST /api/room/create` 创建带编号的 DO，前端加"创建房间"按钮 + 输入房间号加入。
