import { Scene, MeshBuilder, Color3, Vector3, LinesMesh } from '@babylonjs/core';
import type { BulletState } from '@shared/protocol';

export class BulletRenderer {
  private scene: Scene;
  private tracers = new Map<number, LinesMesh>();
  private tracersAge = new Map<number, number>();

  constructor(scene: Scene) { this.scene = scene; }

  update(bullets: BulletState[], dt: number) {
    const alive = new Set<number>();
    for (const b of bullets) {
      alive.add(b.id);
      const p1 = new Vector3(b.x, b.y, b.z);
      const vlen = Math.hypot(b.dx, b.dy, b.dz) || 1;
      const TRACE_LEN = 3.0;
      const p2 = new Vector3(b.x - b.dx / vlen * TRACE_LEN, b.y - b.dy / vlen * TRACE_LEN, b.z - b.dz / vlen * TRACE_LEN);
      let line = this.tracers.get(b.id);
      if (!line) {
        line = MeshBuilder.CreateLines('b_' + b.id, { points: [p1, p2] }, this.scene);
        line.color = new Color3(1, 0.95, 0.5);
        line.alpha = 0.9;
        this.tracers.set(b.id, line);
      } else {
        try {
          // @ts-ignore - setPoints 是 Babylon 内部方法，存在但类型缺失
          line.setPoints([p1, p2]);
        } catch {
          // 回退：dispose + 重建
          line.dispose();
          const nl = MeshBuilder.CreateLines('b_' + b.id, { points: [p1, p2] }, this.scene);
          nl.color = new Color3(1, 0.95, 0.5);
          nl.alpha = 0.9;
          this.tracers.set(b.id, nl);
        }
      }
      this.tracersAge.set(b.id, 0);
    }
    const toDelete: number[] = [];
    for (const [id, age] of this.tracersAge.entries()) {
      if (!alive.has(id)) {
        const na = age + dt;
        if (na > 0.08) toDelete.push(id);
        else this.tracersAge.set(id, na);
      }
    }
    for (const id of toDelete) {
      this.tracers.get(id)?.dispose();
      this.tracers.delete(id);
      this.tracersAge.delete(id);
    }
  }

  dispose() {
    for (const t of this.tracers.values()) t.dispose();
    this.tracers.clear();
    this.tracersAge.clear();
  }
}
