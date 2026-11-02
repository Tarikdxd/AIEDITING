import {StykanimateAdapter} from '../packages/adapters/stykanimate/src/index.ts';

const adapter = new StykanimateAdapter();
console.log(await adapter.getHealth());
const job = await adapter.render({
  mode: 'scene',
  projectDir: process.cwd(),
  outputPath: 'tests/.tmp/styk.mp4',
  scene: {template: 'clip', props: {speed: 0.5, key: 'white'}},
  width: 640,
  height: 360,
  fps: 30,
  duration: 2,
  format: 'mp4',
  onProgress: () => process.stdout.write('.'),
});
console.log('\n', job.status, job.error ?? '');
