import {MotionCanvasAdapter} from '../packages/adapters/motion-canvas/src/index.ts';

const adapter = new MotionCanvasAdapter();
console.log(await adapter.getHealth());
const job = await adapter.render({
  mode: 'scene',
  projectDir: process.cwd(),
  outputPath: 'tests/.tmp/motion-canvas.mp4',
  scene: {template: 'flow', props: {title: 'AIEDITING', eyebrow: 'FLOW', nodes: [
    {label: 'Brief', note: 'intent', color: '#8b5cf6'},
    {label: 'Plan', note: 'timeline', color: '#22d3ee'},
    {label: 'Render', note: 'engines', color: '#a78bfa'},
    {label: 'QA', note: 'verify', color: '#34d399'},
  ]}},
  width: 640,
  height: 360,
  fps: 30,
  duration: 3,
  format: 'mp4',
  onProgress: () => process.stdout.write('.'),
});
console.log('\n', job.status, job.error ?? '');
