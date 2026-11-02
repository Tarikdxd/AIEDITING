import {describe, expect, it} from 'vitest';
import {join, resolve} from 'node:path';
import {mkdirSync, rmSync} from 'node:fs';
import {AdapterRegistry} from '@aiediting/adapter-sdk';
import {FfmpegAdapter} from '@aiediting/adapter-ffmpeg';
import {createProject} from '@aiediting/core';
import {addClip, addTrack} from '@aiediting/timeline';
import {inspectMedia} from '@aiediting/media';
import {RenderManager} from '@aiediting/renderer';

describe('render pipeline (ffmpeg integration)', () => {
  it('renders a small project and verifies the deliverable with ffprobe', async () => {
    const dir = join(process.cwd(), 'tests', '.tmp', 'render', 'basic');
    rmSync(dir, {recursive: true, force: true});
    mkdirSync(dir, {recursive: true});

    const project = createProject({name: 'render-test', width: 1920, height: 1080, fps: 30, duration: 4});
    const video = addTrack(project, {type: 'video', name: 'V', index: 0});
    addClip(project, video.id, {type: 'color', duration: 2, color: '#1a3d5c'});
    addClip(project, video.id, {type: 'color', duration: 2, color: '#5c1a3d', transitionOut: {type: 'fade', duration: 0.4}});

    const registry = new AdapterRegistry().register(new FfmpegAdapter());
    const manager = new RenderManager(registry, resolve(dir, 'renders', 'jobs'));
    const job = await manager.render({project, projectDir: dir, registry, preview: true});

    expect(job.status).toBe('succeeded');
    expect(job.error).toBeUndefined();
    expect(job.outputPath && resolve(job.outputPath).startsWith(resolve(dir))).toBe(true);

    const info = await inspectMedia(job.outputPath!);
    expect(info.metadata.duration).toBeGreaterThan(3.5);
    expect(info.metadata.duration).toBeLessThan(4.6);
    expect(info.metadata.videoCodec).toBe('h264');
    expect(info.metadata.width).toBeGreaterThan(0);
    expect(info.metadata.height).toBeGreaterThan(0);
    expect(info.metadata.size).toBeGreaterThan(5_000);
  }, 180_000);

  it('persists job records under renders/jobs', async () => {
    const dir = join(process.cwd(), 'tests', '.tmp', 'render', 'job-record');
    rmSync(dir, {recursive: true, force: true});
    mkdirSync(dir, {recursive: true});

    const project = createProject({name: 'job-record', duration: 2});
    const video = addTrack(project, {type: 'video', index: 0});
    addClip(project, video.id, {type: 'color', duration: 2, color: '#123456'});

    const registry = new AdapterRegistry().register(new FfmpegAdapter());
    const manager = new RenderManager(registry, resolve(dir, 'renders', 'jobs'));
    const job = await manager.render({project, projectDir: dir, registry, preview: true});
    expect(job.status).toBe('succeeded');

    const jobsDir = resolve(dir, 'renders', 'jobs');
    const fs = await import('node:fs/promises');
    const jobFiles = (await fs.readdir(jobsDir)).filter(file => file.endsWith('.json'));
    expect(jobFiles.length).toBeGreaterThan(0);
    const record = JSON.parse(await fs.readFile(resolve(jobsDir, jobFiles[0]!), 'utf8')) as {
      status?: string;
      outputPath?: string;
    };
    expect(record.status).toBe('succeeded');
    expect(record.outputPath).toBeTruthy();
  }, 120_000);
});
