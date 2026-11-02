import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {ffmpeg, inspectMedia} from '../packages/media/src/index.ts';
import {MptAdapter} from '../packages/adapters/mpt/src/index.ts';

const dir = join(process.cwd(), 'tests', '.tmp', 'mpt');
await rm(dir, {recursive: true, force: true});
await mkdir(join(dir, 'assets'), {recursive: true});
await mkdir(join(dir, 'renders'), {recursive: true});

const material = join(dir, 'assets', 'material.mp4');
await ffmpeg([
  '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12',
  '-pix_fmt', 'yuv420p', '-c:v', 'libx264', material,
]);

const adapter = new MptAdapter();
console.log('health:', await adapter.getHealth());
const job = await adapter.render({
  mode: 'scene',
  projectDir: dir,
  outputPath: join(dir, 'renders', 'mpt-out.mp4'),
  scene: {
    template: 'auto-video',
    props: {
      script: 'Yapay zekâ ile video üretimi artık tek komutla çalışıyor. Bu test görüntüsü MoneyPrinterTurbo motoru ile hazırlandı. Kısa ve net bir kurgu denemesidir.',
      language: 'tr-TR',
      materials: ['assets/material.mp4'],
      voiceName: 'no-voice',
      subtitleEnabled: false,
    },
  },
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 6,
  format: 'mp4',
  onProgress: (value, message) => process.stdout.write(`  ${Math.round(value * 100)}% ${message ?? ''}\n`),
});
console.log('job:', job.status, job.error ?? '');
if (job.status === 'succeeded') {
  console.log(await inspectMedia(join(dir, 'renders', 'mpt-out.mp4')));
}
