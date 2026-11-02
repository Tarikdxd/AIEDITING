import {RemotionAdapter} from '../packages/adapters/remotion/src/index.ts';

const adapter = new RemotionAdapter();
console.log(await adapter.getHealth());
const job = await adapter.render({
  mode: 'scene',
  projectDir: process.cwd(),
  outputPath: 'tests/.tmp/remotion.mp4',
  scene: {template: 'stat', props: {eyebrow: 'TEST', value: '42', label: 'cevap'}},
  width: 640,
  height: 360,
  fps: 30,
  duration: 2,
  format: 'mp4',
  onProgress: () => process.stdout.write('.'),
});
console.log('\n', job.status, job.error ?? '');
