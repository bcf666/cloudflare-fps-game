import type { Team } from '@shared/constants';

interface ResultOpts {
  result: { winner: 'A' | 'B' | 'draw'; scoreA: number; scoreB: number };
  myTeam: Team;
  onBackToMenu: () => void;
  onPlayAgain: () => void;
}

export class ResultScreen {
  el: HTMLElement;
  constructor(root: HTMLElement, opts: ResultOpts) {
    const { result, myTeam } = opts;
    const won = result.winner === myTeam;
    const cls = result.winner === 'draw' ? 'draw-c' : won ? 'win' : 'lose';
    const titleText = result.winner === 'draw' ? '平局！' : won ? '🎉 胜利！' : '😵 失败';
    this.el = document.createElement('div');
    this.el.className = 'center';
    this.el.innerHTML = `
      <div class="panel result">
        <div class="sub">5 分钟对局结束</div>
        <h2 class="${cls}">${titleText}</h2>
        <div class="score-big">
          <span class="a">${result.scoreA}</span>
          <span class="sep">:</span>
          <span class="b">${result.scoreB}</span>
        </div>
        <div style="color:#aab;font-size:13px;">
          ${result.winner === 'A' ? '🔵 蓝队' : result.winner === 'B' ? '🔴 红队' : '双方'} 取得最终胜利
        </div>
        <div class="actions">
          <button class="btn-secondary btn" id="backBtn">返回主菜单</button>
          <button class="btn" id="againBtn">再来一局</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.el.querySelector('#backBtn')!.addEventListener('click', () => opts.onBackToMenu());
    this.el.querySelector('#againBtn')!.addEventListener('click', () => opts.onPlayAgain());
  }
  dispose() { this.el.remove(); }
}
