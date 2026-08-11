# 3D FPS 联机网页游戏设计文档

**日期**: 2026-08-11
**状态**: 已批准,待实施

---

## 1. 项目概述

### 1.1 目标
构建一个可直接在 Cloudflare 上部署的 3D FPS 团队对战网页游戏。玩家可通过浏览器直接游玩,无需下载客户端。

### 1.2 目标平台
- **前端**: 现代浏览器 (Chrome/Firefox/Safari/Edge,支持 WebGL2)
- **后端**: Cloudflare Workers + Durable Objects
- **部署**: Cloudflare Pages(静态资源) + Workers(API/游戏逻辑)

### 1.3 核心玩法
- **模式**: 团队对战 (Team Deathmatch)
- **队伍**: A 队 vs B 队,自动平衡分配
- **单房间人数**: 5-10 人
- **回合时长**: 5 分钟
- **胜负条件**: 回合结束时团队总击杀数高者获胜

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 3D 渲染 | Babylon.js v7 | 内置 Havok 物理引擎,生态成熟 |
| 前端构建 | Vite 5 + TypeScript | 快速 HMR,产出静态资源 |
| 服务端运行时 | Cloudflare Workers | 边缘计算,无服务器 |
| 房间状态管理 | Cloudflare Durable Objects | 单实例权威状态,原子操作 |
| 实时通信 | WebSocket (标准协议) | 客户端↔DO 双向通信 |
| 部署平台 | Cloudflare Pages + Workers | 同域部署,无 CORS |

### 2.2 架构模式:服务器权威 (Server-Authoritative)

```
┌─────────────────────┐
│   Cloudflare DO     │
│  (Room 权威服务器)   │
│  ┌───────────────┐  │
│  │ 游戏循环 30Hz │  │
│  │ - 输入处理    │  │
│  │ - 物理模拟    │  │
│  │ - 碰撞检测    │  │
│  │ - 伤害计算    │  │
│  │ - 状态广播    │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │ WebSocket
           │ (二进制消息)
   ┌───────┴───────┐
   ▼               ▼
┌──────┐       ┌──────┐
│Client│       │Client│
│ -输入│       │ -输入│
│ -渲染│       │ -渲染│
│ -插值│       │ -插值│
└──────┘       └──────┘
```

**原则**:
- Durable Object 维护唯一且权威的游戏状态
- 客户端只发送:输入(按键/鼠标视角/射击),不发送位置
- 客户端接收:状态快照,做插值渲染(不做预测,简化实现)

---

## 3. 项目结构

```
/workspace
├── client/                          # 前端 (Vite + Babylon.js)
│   ├── src/
│   │   ├── main.ts                  # 入口
│   │   ├── App.ts                   # 应用状态机(菜单→大厅→游戏→结算)
│   │   ├── game/
│   │   │   ├── BabylonInstance.ts   # Babylon 引擎/Canvas 封装
│   │   │   ├── GameScene.ts         # 游戏场景(地图/光照/模型)
│   │   │   ├── PlayerController.ts  # 第一人称控制(鼠标/键盘输入采集)
│   │   │   ├── WeaponRenderer.ts    # 武器视图模型 + 射击特效
│   │   │   ├── RemotePlayer.ts      # 远端玩家模型 + 动画插值
│   │   │   ├── BulletRenderer.ts    # 子弹特效渲染
│   │   │   └── NetworkManager.ts    # WebSocket 连接 + 消息序列化
│   │   ├── ui/
│   │   │   ├── MainMenu.ts          # 主菜单 DOM UI
│   │   │   ├── LobbyScreen.ts       # 大厅/房间等待 UI
│   │   │   ├── GameHUD.ts           # 游戏内 HUD (血量/弹药/分数/倒计时)
│   │   │   └── ResultScreen.ts      # 结算 UI
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts               # 配置代理 /api /ws 到本地 Worker
│
├── server/                          # Cloudflare Workers + DO
│   ├── src/
│   │   ├── index.ts                 # Worker 入口: 路由 Pages 静态 /api /ws
│   │   ├── RoomDO.ts                # Durable Object: 房间实例
│   │   ├── game/
│   │   │   ├── ServerGameState.ts   # 权威游戏状态 + tick 循环
│   │   │   ├── ServerPlayer.ts      # 玩家实体 (移动/碰撞/血量)
│   │   │   ├── ServerBullet.ts      # 子弹实体 + 命中检测
│   │   │   └── TeamManager.ts       # 队伍分配 / 分数管理
│   │   └── api/
│   │       └── matchmaker.ts        # 快速匹配 / 创建房间 API
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml                # DO 绑定、路由、Pages 集成
│
└── shared/                          # 前后端共享 (通过 tsconfig paths 引用)
    ├── protocol.ts                  # 网络消息类型 (二进制 schema)
    └── constants.ts                 # 游戏常量:移动速度/伤害/地图尺寸等
```

---

## 4. 共享定义 (shared/)

### 4.1 constants.ts
```
- 玩家: 移动速度 6m/s, 跳跃速度 8m/s, 重力 20m/s², 血量 100
- 武器: 步枪,伤害 25,射速 200ms,弹匣 30,换弹 2s,散射 0.02rad
- 地图: 50m × 50m, 出生点 A(左区) / B(右区) 各 3 个
- 网络: tick 30Hz (33ms), 状态快照每 tick 广播
- 回合: 5 分钟, 最少 2 人开始
```

### 4.2 protocol.ts (消息类型)
使用 TypeScript 类型 + 自定义二进制序列化(每个消息首字节 MessageType,后跟字段):

**Client → Server**:
| 类型 | 字段 |
|------|------|
| `JoinRoom(roomId, team?)` | 加入房间,可选指定队伍 |
| `Input(seq, moveX, moveZ, jump, yaw, pitch, shooting, reload)` | 每一帧输入,seq 递增 |

**Server → Client**:
| 类型 | 字段 |
|------|------|
| `Welcome(playerId, team)` | 加入成功,分配 playerId 和队伍 |
| `PlayerJoin(id, team, name)` | 其他玩家加入通知 |
| `PlayerLeave(id)` | 其他玩家离开 |
| `StateSnapshot(tick, players[], bullets[], scoreA, scoreB, timeLeft)` | 每 tick 状态全量快照 |
| `HitEvent(victimId, damage, shooterId)` | 命中通知(做受伤特效) |
| `KillEvent(killerId, victimId)` | 击杀通知(做 UI 飘字) |
| `GameStart()` | 回合开始 |
| `GameEnd(winner, scoreA, scoreB)` | 回合结束 |

**StateSnapshot 中 Player 结构**: `{id, x, y, z, yaw, pitch, hp, ammo, reloading, team}`

---

## 5. 服务器端设计 (server/)

### 5.1 Worker 入口 (index.ts)
- `GET /` → 返回 Pages 静态资源(Pages 集成后自动处理,此处兜底)
- `POST /api/matchmaking/quick` → 查询/创建可用房间,返回 `{roomId, doName}`
- `GET /api/room/:id` → 返回房间信息(人数/状态)
- `GET /ws/:roomId` → 升级 WebSocket,路由到对应 Room DO

### 5.2 Durable Object (RoomDO.ts)
**生命周期**:
1. `fetch()` 接收 WebSocket 升级,`acceptWebSocket()` 加入 `clients: Map<PlayerId, WebSocket>`
2. 玩家加入时 `TeamManager` 分配队伍到较少一方
3. 玩家数 ≥2 且未开始 → 3 秒倒计时后开始
4. 开始后用 `setInterval` 每 33ms 调一次 `gameState.tick()`
5. Tick 内:处理输入队列 → 更新所有玩家位置 → 处理射击/子弹 → 碰撞/命中 → 广播快照
6. 回合结束 → 广播 `GameEnd` → 等待 10 秒重置或玩家全部离开

### 5.3 ServerGameState.ts (核心)
```
- players: Map<id, ServerPlayer>
- bullets: ServerBullet[]
- scoreA, scoreB: number
- phase: 'waiting' | 'playing' | 'ended'
- timeLeft: number (秒)

tick(dt, inputsThisTick):
  1. 对于每个玩家: applyInput(input) → 移动 → 与地图/其他玩家碰撞
  2. 处理射击: 玩家 shooting=true 且冷却完毕 → 生成 ServerBullet(射线)
  3. 子弹更新: 移动子弹 → 命中检测(玩家 AABB) → 扣血 → 击杀 → 加分
  4. timeLeft -= dt → 时间到 → phase=ended
  5. 序列化 StateSnapshot → 广播给所有 client
```

### 5.4 碰撞检测简化
- 玩家:AABB(胶囊体近似),高度 1.8m,半径 0.4m
- 地图:平面 + 若干立方体障碍物(墙/箱子),静态 AABB
- 子弹:射线(Raycast),每 tick 检测是否穿过多边形玩家 hitbox

---

## 6. 客户端设计 (client/)

### 6.1 应用状态机 (App.ts)
```
MainMenu → (点快速匹配) → LobbyScreen → (等待/倒计时) → GameScene → (结束) → ResultScreen → MainMenu
```

### 6.2 游戏场景 (GameScene.ts)
- Babylon `Engine` + `Scene` + `ArcRotateCamera` 改第一人称
- 灯光:1 个 HemisphericLight + 1 个 DirectionalLight(投影)
- 地图:地面 plane +  procedurally 生成的墙/箱子(用 Blender 导出 glTF 太复杂,直接用 CreateBox 拼)
- 第一人称摄像机:父节点是玩家碰撞体,yaw/pitch 控制相机旋转
- 武器模型:右手挂在相机节点下,用几个 Box 拼成枪的形状(简化)

### 6.3 PlayerController.ts
- 监听 `keydown/keyup` WASD / Space / R
- 监听 `pointerlock` 鼠标移动 → yaw/pitch
- 每帧(60fps)把当前输入打包,通过 NetworkManager 发送给服务器(每帧都发,服务器用最新的)
- 本地不修改玩家位置,完全等服务器快照插值渲染

### 6.4 远端玩家插值
- 每个 RemotePlayer 保存最近 2 个快照状态 S_prev(t_prev) 和 S_curr(t_curr)
- 当前渲染时间 t_render ∈ [t_prev + 100ms, t_curr + 100ms] (固定 100ms 延迟缓冲)
- 在两个状态之间线性插值位置、视角、血量
- 这样即使网络抖动也能保持平滑

### 6.5 UI
- 全部用 DOM(HTML/CSS)而非 Babylon GUI,便于控制样式和响应式
- 游戏中 HUD 绝对定位覆盖在 canvas 上
- Pointer lock 进入时隐藏菜单,按 ESC 解锁

---

## 7. 部署配置

### 7.1 wrangler.toml (Server)
```toml
name = "fps-game-server"
compatibility_date = "2026-08-01"
account_id = "your-account-id"

[durable_objects]
bindings = [
  { name = "ROOM", class_name = "RoomDO" }
]

[vars]
ENVIRONMENT = "production"

[[routes]]
pattern = "your-domain.com/api/*"
custom_domain = true

[[routes]]
pattern = "your-domain.com/ws/*"
custom_domain = true
```

### 7.2 Pages 集成
- 前端 `npm run build` 输出 `client/dist/`
- 在 Cloudflare Dashboard 创建 Pages 项目,连接 Git 仓库或直接上传
- Pages → Settings → Functions → Durable Object bindings → 绑定 `ROOM` DO
- 或使用 Monorepo 方案:Pages 构建命令 `cd client && npm ci && npm run build`,构建输出 `client/dist`

### 7.3 本地开发
- Server: `npx wrangler dev server/src/index.ts --local` (端口 8787)
- Client: Vite `server.proxy` 配置 `/api` 和 `/ws` → `http://localhost:8787`
- 同时启动两个进程,浏览器访问 Vite 开发服务器即可

---

## 8. 关键风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Durable Object 单 tick 处理 10 玩家超时 | 游戏卡顿/掉线 | tick 降为 20Hz,优化碰撞检测用空间分割(网格) |
| 网络抖动导致位置跳动 | 体验差 | 100ms 缓冲插值 + 关键帧强制纠正 |
| 玩家刷小号/恶意连接 | DO 资源耗尽 | 限制每 IP 同时连接数,加入速率限制(Rate Limiter API) |
| Babylon.js 首屏包体过大 (>5MB) | 加载慢 | Vite 拆包,按需加载 Havok,加 Loading 进度条 |

---

## 9. 成功标准
- [ ] 打开首页能看到主菜单
- [ ] 两个浏览器标签页可加入同一房间
- [ ] 玩家可 WASD 移动 + 空格跳跃 + 鼠标视角 + 左键射击
- [ ] 子弹可命中对方,对方血量减少,死亡后 respawn
- [ ] HUD 实时显示双方分数和倒计时
- [ ] 时间到显示结算界面
- [ ] `wrangler deploy` 和 Pages 部署成功,公网域名可访问
