export class MainMenu {
  el: HTMLElement;
  constructor(root: HTMLElement, opts: { onQuickMatch: () => void }) {
    this.el = document.createElement('div');
    this.el.className = 'center';
    this.el.innerHTML = `
      <div class="panel menu">
        <h1>TEAM FPS</h1>
        <div class="sub">3D 团队对战 · 浏览器直接开玩</div>
        <div class="btn-row">
          <button class="btn" id="btn-quick">快速匹配</button>
          <button class="btn btn-secondary" id="btn-how">操作说明</button>
        </div>
        <div id="how" style="display:none;margin-top:24px;text-align:left;font-size:13px;line-height:1.9;color:#aab;background:rgba(0,0,0,0.25);padding:14px 18px;border-radius:8px;border:1px solid #2a2a3c;">
          <b style="color:#fff;font-size:14px;">🎮 操作方式：</b><br>
          <div style="margin-top:6px;">
            <span style="display:inline-block;min-width:130px;"><b>W / A / S / D</b>　移动</span><br>
            <span style="display:inline-block;min-width:130px;"><b>Space</b>　跳跃</span><br>
            <span style="display:inline-block;min-width:130px;"><b>鼠标左键</b>　射击</span><br>
            <span style="display:inline-block;min-width:130px;"><b>鼠标移动</b>　视角</span><br>
            <span style="display:inline-block;min-width:130px;"><b>R</b>　换弹</span><br>
            <span style="display:inline-block;min-width:130px;"><b>ESC</b>　解锁鼠标</span>
          </div>
          <div style="margin-top:14px;color:#99a;">
            <b>规则：</b>蓝队 vs 红队，5 分钟内击杀数更高的队伍获胜。被击杀后 3 秒自动在己方出生点复活。
          </div>
        </div>
      </div>`;
    root.appendChild(this.el);
    const quickBtn = this.el.querySelector('#btn-quick') as HTMLButtonElement;
    quickBtn.addEventListener('click', () => opts.onQuickMatch());
    const howBtn = this.el.querySelector('#btn-how')!;
    const how = this.el.querySelector<HTMLElement>('#how')!;
    howBtn.addEventListener('click', () => {
      if (how.style.display === 'none') { how.style.display = 'block'; (howBtn as any).textContent = '收起说明'; }
      else { how.style.display = 'none'; (howBtn as any).textContent = '操作说明'; }
    });
  }
  dispose() { this.el.remove(); }
}
