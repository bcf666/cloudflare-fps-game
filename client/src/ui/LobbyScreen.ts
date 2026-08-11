import { NetworkManager, Snapshot } from '../game/NetworkManager';
import { Team } from '@shared/constants';
import { GAME_CONSTANTS } from '@shared/constants';

interface LobbyOpts {
  net: NetworkManager;
  myTeam$: () => Team;
  myPlayerId$: () => string;
}

interface PlayerInfo { team: Team; name: string; }

export class LobbyScreen {
  el: HTMLElement;
  opts: LobbyOpts;
  onStart: () => void = () => {};

  private statusEl!: HTMLElement;
  private listA!: HTMLElement;
  private listB!: HTMLElement;
  private countdownEl: HTMLElement | null = null;

  private players = new Map<string, PlayerInfo>();
  private countdownLeft: number = GAME_CONSTANTS.GAME.COUNTDOWN_S;
  private phase: 'waiting' | 'countdown' | 'playing' = 'waiting';

  constructor(root: HTMLElement, opts: LobbyOpts) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'center';
    this.el.innerHTML = `
      <div class="panel lobby">
        <h2>等待玩家加入…</h2>
        <div class="teams">
          <div class="team-card team-a">
            <h3>🔵 蓝队 (A)</h3>
            <ul class="player-list" id="listA"></ul>
          </div>
          <div class="team-card team-b">
            <h3>🔴 红队 (B)</h3>
            <ul class="player-list" id="listB"></ul>
          </div>
        </div>
        <div class="status" id="status">等待中…</div>
        <div id="countdownWrap" style="display:none;"><div class="countdown" id="countdown">3</div></div>
      </div>`;
    root.appendChild(this.el);
    this.listA = this.el.querySelector('#listA')!;
    this.listB = this.el.querySelector('#listB')!;
    this.statusEl = this.el.querySelector('#status')!;
    this.countdownEl = this.el.querySelector('#countdown');
    this.render();
    // 倒计时显示每帧更新
    const tick = () => {
      if (!this.el.isConnected) return;
      if (this.phase === 'countdown') {
        const wrap = this.el.querySelector<HTMLElement>('#countdownWrap')!;
        wrap.style.display = 'block';
        const n = Math.max(0, Math.ceil(this.countdownLeft));
        if (this.countdownEl) this.countdownEl.textContent = n > 0 ? String(n) : 'GO!';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  onPlayerJoin(id: string, team: Team, name: string) {
    if (id === this.opts.myPlayerId$()) {
      this.players.set(id, { team, name: '你（' + id.slice(0, 5) + '）' });
    } else {
      this.players.set(id, { team, name: name + '（' + id.slice(0, 5) + '）' });
    }
    this.render();
  }
  onPlayerLeave(id: string) { this.players.delete(id); this.render(); }

  onSnapshot(s: Snapshot) {
    // 根据 players 推断
    for (const p of s.players) {
      const name = p.id === this.opts.myPlayerId$()
        ? '你（' + p.id.slice(0, 5) + '）'
        : ('玩家 ' + p.id.slice(0, 5));
      if (!this.players.has(p.id) || this.players.get(p.id)!.team !== p.team) {
        this.players.set(p.id, { team: p.team, name });
      }
    }
    const total = s.players.length;
    // 倒计时估算：timeLeft > 297 时为 countdown（5分钟=300s，减去3s倒计时=297）
    if (s.timeLeft > GAME_CONSTANTS.GAME.MATCH_DURATION_S - 0.1 && total >= GAME_CONSTANTS.GAME.MIN_PLAYERS) {
      this.phase = 'countdown';
      // countdownLeft 需要自行估算（服务器不广播），从≥2人开始模拟 3s
      if (!this._countdownStartedAt) {
        this._countdownStartedAt = performance.now();
      }
      this.countdownLeft = Math.max(0, GAME_CONSTANTS.GAME.COUNTDOWN_S - (performance.now() - this._countdownStartedAt) / 1000);
    } else if (s.timeLeft <= GAME_CONSTANTS.GAME.MATCH_DURATION_S - 0.1 && s.timeLeft > 0) {
      this.phase = 'playing';
      setTimeout(() => this.onStart(), 50);
    }
    const needed = Math.max(0, GAME_CONSTANTS.GAME.MIN_PLAYERS - total);
    if (this.phase === 'waiting') {
      this.statusEl.textContent = needed > 0
        ? `还需要 ${needed} 位玩家才能开始（当前 ${total}/${GAME_CONSTANTS.GAME.MAX_PLAYERS}）`
        : `人数充足，即将开始对局（当前 ${total}/${GAME_CONSTANTS.GAME.MAX_PLAYERS}）`;
    } else if (this.phase === 'countdown') {
      this.statusEl.textContent = `对局即将开始！（当前 ${total}/${GAME_CONSTANTS.GAME.MAX_PLAYERS}）`;
    }
    this.render();
  }

  private _countdownStartedAt = 0;

  private render() {
    const A: Array<{ id: string; name: string }> = [];
    const B: Array<{ id: string; name: string }> = [];
    const myId = this.opts.myPlayerId$();
    for (const [id, p] of this.players.entries()) {
      (p.team === 'A' ? A : B).push({ id, name: p.name });
    }
    const isYou = (id: string) => id === myId;
    this.listA.innerHTML = A.length
      ? A.map(p => `<li class="${isYou(p.id) ? 'you' : ''}">• ${p.name}</li>`).join('')
      : '<li style="opacity:0.4">（空）</li>';
    this.listB.innerHTML = B.length
      ? B.map(p => `<li class="${isYou(p.id) ? 'you' : ''}">• ${p.name}</li>`).join('')
      : '<li style="opacity:0.4">（空）</li>';
  }

  dispose() { this.el.remove(); }
}
