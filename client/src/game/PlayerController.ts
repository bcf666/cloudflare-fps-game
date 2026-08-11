import { NetworkManager } from './NetworkManager';

export interface PlayerViewState {
  yaw: number;
  pitch: number;
}

export class PlayerController {
  canvas: HTMLCanvasElement;
  net: NetworkManager;

  yaw = 0;
  pitch = 0;

  private keys = new Set<string>();
  private mouseDown = false;
  private _pointerLocked = false;

  onFirePress: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, net: NetworkManager) {
    this.canvas = canvas; this.net = net;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.net.setInput({ reload: true });
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // 若未锁指针，点击 canvas 先锁；锁了才开始射击
        if (!this._pointerLocked) {
          canvas.requestPointerLock?.();
        } else {
          this.mouseDown = true;
          this.onFirePress();
        }
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === canvas;
      // 锁指针后持续左键射击状态
      if (this._pointerLocked) {
        // 不立即设 mouseDown，等待用户再按
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._pointerLocked) return;
      const sens = 0.0024;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
  }

  /**
   * @returns previous shooting state for muzzle flash detection edge
   */
  update(): { prevShooting: boolean; nowShooting: boolean } {
    const w = this.keys.has('KeyW');
    const s = this.keys.has('KeyS');
    const a = this.keys.has('KeyA');
    const d = this.keys.has('KeyD');
    const moveZ = (w ? 1 : 0) - (s ? 1 : 0);
    const moveX = (d ? 1 : 0) - (a ? 1 : 0);
    const jump = this.keys.has('Space');
    const prev = this.net.getLastInput().shooting;
    this.net.setInput({ moveX, moveZ, jump, shooting: this.mouseDown, yaw: this.yaw, pitch: this.pitch });
    return { prevShooting: prev, nowShooting: this.mouseDown };
  }

  isPointerLocked() { return this._pointerLocked; }
}
