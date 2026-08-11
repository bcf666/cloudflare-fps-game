import { App } from './App';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;
const app = new App(canvas, uiRoot);
(window as any).__app = app;
app.start();
