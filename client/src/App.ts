import { BabylonInstance } from './game/BabylonInstance';
import { NetworkManager } from './game/NetworkManager';
import { MainMenu } from './ui/MainMenu';
import { LobbyScreen } from './ui/LobbyScreen';
import { GameScene } from './game/GameScene';
import { GameHUD } from './ui/GameHUD';
import { ResultScreen } from './ui/ResultScreen';
import type { Team } from '@shared/constants';

export type Phase = 'menu' | 'lobby' | 'playing' | 'result';
type GameEndCb = (winner: 'A' | 'B' | 'draw', scoreA: number, scoreB: number) => void;

export class App {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLDivElement;
  babylon: BabylonInstance;
  net: NetworkManager = new NetworkManager();
  scene: GameScene | null = null;
  phase: Phase = 'menu';

  myPlayerId: string | null = null;
  myTeam: Team | null = null;
  lastResult: { winner: 'A' | 'B' | 'draw'; scoreA: number; scoreB: number } | null = null;
  private _cleanupWelcome: ((id: string, team: Team) => void) | null = null;
  private _cleanupStart: (() => void) | null = null;
  private _cleanupEnd: GameEndCb | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.babylon = new BabylonInstance(canvas);
  }

  async start() {
    try {
      await this.babylon.init();
    } catch (e) {
      console.error('Babylon init failed (WebGL may not be available):', e);
      // 继续运行 UI 让菜单仍可显示；只有进入游戏时会再报错
    }
    this.showMainMenu();
    try { this.babylon.runRenderLoop(); } catch (e) { console.warn(e); }
  }

  setPhase(p: Phase) {
    this.phase = p;
    this.uiRoot.innerHTML = '';
    // 清理全局网络回调
    this._cleanupWelcome = null;
    this._cleanupStart = null;
    this._cleanupEnd = null;
  }

  showMainMenu() {
    this.setPhase('menu');
    new MainMenu(this.uiRoot, {
      onQuickMatch: async () => {
        const overlay = document.createElement('div');
        overlay.className = 'center';
        overlay.innerHTML = `<div class="panel" style="min-width:280px;text-align:center;"><div class="loading">正在连接匹配服务</div></div>`;
        this.uiRoot.appendChild(overlay);
        try {
          const res = await fetch('/api/matchmaking/quick', { method: 'POST' });
          if (!res.ok) throw new Error('match server err ' + res.status);
          const info = await res.json();
          await this.net.connect(info.wsUrl);
          this._cleanupWelcome = (id: string, team: Team) => {
            this.myPlayerId = id; this.myTeam = team;
          };
          this.net.onWelcome = this._cleanupWelcome;
          this.showLobby();
        } catch (e) {
          overlay.innerHTML = `
            <div class="panel" style="min-width:320px;text-align:center;">
              <div style="color:#ff6677;margin-bottom:14px;">连接失败：${(e as Error).message}</div>
              <div style="font-size:13px;color:#aab;margin-bottom:18px;">
                请确认服务器已启动 (cd server && npm run dev)<br>
                或检查您的网络
              </div>
              <button class="btn" id="backBtn">返回主菜单</button>
            </div>`;
          overlay.querySelector('#backBtn')!.addEventListener('click', () => this.showMainMenu());
        }
      },
    });
  }

  showLobby() {
    this.setPhase('lobby');
    const lobby = new LobbyScreen(this.uiRoot, {
      net: this.net,
      myTeam$: () => this.myTeam!,
      myPlayerId$: () => this.myPlayerId!,
    });
    this.net.onPlayerJoin = (id, team, name) => lobby.onPlayerJoin(id, team, name);
    this.net.onPlayerLeave = (id) => lobby.onPlayerLeave(id);
    this.net.onSnapshot = (s) => lobby.onSnapshot(s);
    this._cleanupStart = () => this.startGame();
    this.net.onGameStart = this._cleanupStart;
    this._cleanupEnd = (winner, a, b) => {
      this.lastResult = { winner, scoreA: a, scoreB: b };
      this.showResult();
    };
    this.net.onGameEnd = this._cleanupEnd;
  }

  startGame() {
    if (this.phase === 'playing') return;
    this.setPhase('playing');
    this.scene = new GameScene(this.babylon, {
      myPlayerId: this.myPlayerId!,
      myTeam: this.myTeam!,
      net: this.net,
    });
    const hud = new GameHUD(this.uiRoot, { net: this.net, myPlayerId: this.myPlayerId! });
    this.scene.onMyHpChange = (hp) => hud.setHp(hp);
    this.scene.onMyAmmoChange = (ammo, reloading) => hud.setAmmo(ammo, reloading);
    this.scene.onHit = (dmg) => hud.triggerHit();
    this.scene.onKill = (k, v) => hud.showKill(k, v);
    this.scene.onScoreChange = (a, b, t) => hud.setScore(a, b, t);
    this._cleanupEnd = (winner, a, b) => {
      this.lastResult = { winner, scoreA: a, scoreB: b };
      this.showResult();
    };
    this.net.onGameEnd = this._cleanupEnd;
  }

  showResult() {
    if (!this.lastResult) return;
    this.setPhase('result');
    if (this.scene) { this.scene.dispose(); this.scene = null; }
    new ResultScreen(this.uiRoot, {
      result: this.lastResult,
      myTeam: this.myTeam!,
      onBackToMenu: () => { this.net.close(); this.showMainMenu(); },
      onPlayAgain: async () => {
        this.net.close();
        const overlay = document.createElement('div');
        overlay.className = 'center';
        overlay.innerHTML = `<div class="panel" style="min-width:280px;text-align:center;"><div class="loading">正在重连</div></div>`;
        this.uiRoot.appendChild(overlay);
        try {
          const res = await fetch('/api/matchmaking/quick', { method: 'POST' });
          const info = await res.json();
          await this.net.connect(info.wsUrl);
          this.net.onWelcome = (id, team) => { this.myPlayerId = id; this.myTeam = team; };
          this.showLobby();
        } catch {
          this.showMainMenu();
        }
      },
    });
  }
}
