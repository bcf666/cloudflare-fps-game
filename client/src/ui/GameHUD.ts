import { NetworkManager } from '../game/NetworkManager';
import { GAME_CONSTANTS } from '@shared/constants';

const C = GAME_CONSTANTS;

export class GameHUD {
  el: HTMLElement;
  net: NetworkManager;
  myPlayerId: string;

  hpFill!: HTMLElement;
  hpText!: HTMLElement;
  ammoEl!: HTMLElement;
  scoreAEl!: HTMLElement;
  scoreBEl!: HTMLElement;
  timerEl!: HTMLElement;
  hitFlash!: HTMLElement;
  killBanner!: HTMLElement;

  private _showKillTimer: any;

  constructor(root: HTMLElement, opts: { net: NetworkManager; myPlayerId: string }) {
    this.net = opts.net; this.myPlayerId = opts.myPlayerId;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="crosshair"></div>
      <div class="hit-flash" id="hit-flash"></div>
      <div class="kill-banner" id="kill-banner"></div>
      <div class="top-center">
        <div class="score"><span class="a" id="scoreA">0</span><span class="sep">:</span><span class="b" id="scoreB">0</span></div>
        <div class="timer" id="timer">05:00</div>
      </div>
      <div class="bottom-left">
        <div class="hp-bar"><div class="hp-fill" id="hp-fill" style="width:100%"></div></div>
        <div class="hp-text" id="hp-text">HP ${C.PLAYER.MAX_HP} / ${C.PLAYER.MAX_HP}</div>
        <div class="ammo" id="ammo">${C.WEAPON.MAG_SIZE} <span style="opacity:.5;font-weight:400;font-size:16px;">/ ${C.WEAPON.MAG_SIZE}</span></div>
      </div>
    `;
    root.appendChild(this.el);
    this.hpFill = this.el.querySelector('#hp-fill')!;
    this.hpText = this.el.querySelector('#hp-text')!;
    this.ammoEl = this.el.querySelector('#ammo')!;
    this.scoreAEl = this.el.querySelector('#scoreA')!;
    this.scoreBEl = this.el.querySelector('#scoreB')!;
    this.timerEl = this.el.querySelector('#timer')!;
    this.hitFlash = this.el.querySelector('#hit-flash')!;
    this.killBanner = this.el.querySelector('#kill-banner')!;
  }

  setHp(hp: number) {
    const actual = Math.max(0, hp);
    const pct = Math.max(0, actual / C.PLAYER.MAX_HP) * 100;
    this.hpFill.style.width = pct + '%';
    this.hpText.textContent = `HP ${actual} / ${C.PLAYER.MAX_HP}`;
    if (pct < 30) this.hpFill.style.background = 'linear-gradient(90deg,#e33,#ff7)';
    else this.hpFill.style.background = 'linear-gradient(90deg,#2c5,#7f8)';
  }
  setAmmo(ammo: number, reloading: boolean) {
    if (reloading) this.ammoEl.innerHTML = `<span class="reload">换弹中…</span>`;
    else this.ammoEl.innerHTML = `${ammo} <span style="opacity:.5;font-weight:400;font-size:16px;">/ ${C.WEAPON.MAG_SIZE}</span>`;
  }
  setScore(a: number, b: number, timeLeft: number) {
    this.scoreAEl.textContent = String(Math.max(0, a));
    this.scoreBEl.textContent = String(Math.max(0, b));
    const t = Math.max(0, timeLeft);
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    this.timerEl.textContent = `${mm}:${ss}`;
  }
  triggerHit() {
    this.hitFlash.style.opacity = '1';
    clearTimeout((this as any)._hfT);
    (this as any)._hfT = setTimeout(() => { this.hitFlash.style.opacity = '0'; }, 180);
  }
  showKill(killerId: string, victimId: string) {
    const fmt = (id: string) =>
      id === this.myPlayerId ? '<span style="color:#ffb020">你</span>' : id.slice(0, 5);
    this.killBanner.innerHTML = `${fmt(killerId)}　<span style="opacity:.5">击杀了</span>　${fmt(victimId)}`;
    this.killBanner.classList.add('show');
    clearTimeout(this._showKillTimer);
    this._showKillTimer = setTimeout(() => this.killBanner.classList.remove('show'), 2200);
  }
  dispose() { this.el.remove(); clearTimeout(this._showKillTimer); }
}
