import { Engine, Scene } from '@babylonjs/core';

export class BabylonInstance {
  canvas: HTMLCanvasElement;
  engine!: Engine;
  scene!: Scene;
  private raf = 0;
  private _initDone = false;

  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }

  async init() {
    if (this._initDone) return;
    this._initDone = true;
    const adaptToDevice = window.matchMedia('(max-width: 900px)').matches;
    const antialias = !adaptToDevice;
    this.engine = new Engine(this.canvas, antialias, { preserveDrawingBuffer: false, stencil: true }, false);
    this.scene = new Scene(this.engine);
    const scale = 1 / (window.devicePixelRatio || 1);
    try { this.engine.setHardwareScalingLevel(scale); } catch {}
    window.addEventListener('resize', () => this.engine.resize());
  }

  runRenderLoop() {
    const loop = () => {
      try { if (this.scene && this.engine) this.scene.render(); } catch (e) { console.warn(e); }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
