import {HyperframesAdapter} from '../packages/adapters/hyperframes/src/index.ts';

const adapter = new HyperframesAdapter();
console.log(await adapter.getHealth());
const job = await adapter.render({
  mode: 'scene',
  projectDir: process.cwd(),
  outputPath: 'tests/.tmp/hyperframes.mp4',
  scene: {template: 'title', props: {eyebrow: 'TEST', title: 'AIEDITING', subtitle: 'HTML to video'}},
  width: 640,
  height: 360,
  fps: 30,
  duration: 2,
  format: 'mp4',
  onProgress: () => process.stdout.write('.'),
});
console.log('\n', job.status, job.error ?? '');
