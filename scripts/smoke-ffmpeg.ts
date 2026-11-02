import {join} from 'node:path';
import {mkdir, rm} from 'node:fs/promises';
import {createProject} from '../packages/core/src/index.ts';
import {addClip, addSubtitle, addText, addTrack} from '../packages/timeline/src/index.ts';
import {importAsset} from '../packages/asset-manager/src/index.ts';
import {FfmpegAdapter} from '../packages/adapters/ffmpeg/src/index.ts';
import {ffmpeg, inspectMedia} from '../packages/media/src/index.ts';

const dir = join(process.cwd(), 'tests', '.tmp', 'smoke');
await rm(dir, {recursive: true, force: true});
await mkdir(join(dir, 'assets'), {recursive: true});
await mkdir(join(dir, 'renders'), {recursive: true});

const video = join(dir, 'assets', 'source.mp4');
const audio = join(dir, 'assets', 'source.wav');
await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', video]);
await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=3', '-c:a', 'pcm_s16le', audio]);

const project = createProject({name: 'Smoke', width: 640, height: 360, fps: 30, background: '#101018'});
const videoAsset = await importAsset(dir, project, video);
const audioAsset = await importAsset(dir, project, audio);
const videoTrack = addTrack(project, {type: 'video', name: 'Video', index: 0});
const audioTrack = addTrack(project, {type: 'audio', name: 'Audio', index: 1});
addClip(project, videoTrack.id, {type: 'video', assetId: videoAsset.id, start: 0, duration: 3, volume: 0});
addClip(project, audioTrack.id, {type: 'audio', assetId: audioAsset.id, start: 0, duration: 3, volume: 0.4});
addText(project, {text: 'Merhaba AIEDITING', start: 0.2, duration: 2.6, style: {fontSize: 54, color: '#ffffff', bold: true}});
addSubtitle(project, {text: 'Türkçe altyazı testi', start: 0.4, duration: 2.2});

const adapter = new FfmpegAdapter();
const output = join(dir, 'renders', 'out.mp4');
const job = await adapter.render({
  mode: 'project',
  project,
  projectDir: dir,
  outputPath: output,
  width: 640,
  height: 360,
  fps: 30,
  duration: 3,
  exportSettings: project.settings.export,
  onProgress: (value) => process.stdout.write(`\rprogress ${(value * 100).toFixed(0)}%`),
});
console.log('\njob', job.status, job.outputPath);
console.log(await inspectMedia(output));
