import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {
  AdapterRegistry,
  type RenderJob,
  type RenderJobStatus,
  type RenderStatus,
} from '@aiediting/adapter-sdk';
import {ensureDir, inspectMedia} from '@aiediting/media';
import {assertValidProject, assetSchema, type AIEDITINGProject, type Clip, type ExportSettings} from '@aiediting/project-schema';
import {projectDuration} from '@aiediting/timeline';

export interface RenderManagerOptions {
  registry: AdapterRegistry;
  projectDir: string;
  project: AIEDITINGProject;
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  exportSettings?: ExportSettings;
  preview?: boolean;
  retry?: number;
}

export interface ManagedRenderJob extends RenderJob {
  projectId: string;
  projectDir: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

export class RenderManager {
  readonly registry: AdapterRegistry;
  private readonly jobs = new Map<string, ManagedRenderJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly jobDir: string;

  constructor(registry: AdapterRegistry, jobDir: string) {
    this.registry = registry;
    this.jobDir = jobDir;
  }

  async render(options: RenderManagerOptions): Promise<ManagedRenderJob> {
    const project = assertValidProject(structuredClone(options.project));
    const jobId = `render_${randomUUID()}`;
    const duration = options.duration ?? projectDuration(project);
    const baseWidth = options.width ?? project.settings.width;
    const baseHeight = options.height ?? project.settings.height;
    const width = options.preview ? Math.max(16, Math.round((baseWidth * 0.5) / 2) * 2) : baseWidth;
    const height = options.preview ? Math.max(16, Math.round((baseHeight * 0.5) / 2) * 2) : baseHeight;
    const fps = options.fps ?? project.settings.fps;
    const outputPath = resolve(
      options.outputPath ?? join(options.projectDir, 'renders', `${slug(project.name)}-${Date.now()}${options.preview ? '-preview' : ''}.mp4`),
    );
    await ensureDir(join(options.projectDir, 'renders', 'jobs'));
    const job: ManagedRenderJob = {
      id: jobId,
      projectId: project.id,
      projectDir: options.projectDir,
      engineId: 'renderer',
      status: 'running',
      progress: 0,
      outputPath,
      width,
      height,
      fps,
      duration,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    this.jobs.set(jobId, job);
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    const persist = async () => {
      await writeFile(join(options.projectDir, 'renders', 'jobs', `${jobId}.json`), JSON.stringify(job, null, 2), 'utf8').catch(() => {});
    };
    const update = (progress: number, message?: string) => {
      job.progress = Math.max(job.progress, Math.min(0.99, progress));
      if (message) job.logs.push(`${new Date().toISOString()} ${message}`);
      void persist();
    };

    try {
      await persist();
      const prepared = await this.prepareExternalScenes(project, options, job, update, controller.signal);
      const ffmpeg = this.registry.get('ffmpeg');
      const ffmpegJob = await ffmpeg.render({
        mode: 'project',
        project: prepared,
        projectDir: options.projectDir,
        outputPath,
        width,
        height,
        fps,
        duration,
        exportSettings: options.exportSettings ?? project.settings.export,
        preview: options.preview,
        signal: controller.signal,
        onProgress: (value, message) => update(0.45 + value * 0.5, message ?? 'ffmpeg'),
      });
      if (ffmpegJob.status !== 'succeeded') throw new Error(ffmpegJob.error ?? 'ffmpeg render failed');
      const info = await inspectMedia(outputPath);
      if (!info.metadata.duration || Math.abs(info.metadata.duration - duration) > 0.6) {
        throw new Error(`output validation failed: duration ${info.metadata.duration ?? 'unknown'}s, expected ${duration}s`);
      }
      job.status = 'succeeded';
      job.progress = 1;
      job.engineId = 'ffmpeg';
      job.finishedAt = new Date().toISOString();
      job.logs.push(`${new Date().toISOString()} verified ${info.metadata.duration}s ${info.metadata.width}x${info.metadata.height}`);
      await persist();
      return job;
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = (error as Error).message;
      job.finishedAt = new Date().toISOString();
      await persist();
      throw error;
    } finally {
      this.controllers.delete(jobId);
    }
  }

  async getJob(jobId: string): Promise<ManagedRenderJob | undefined> {
    return this.jobs.get(jobId);
  }

  async status(jobId: string): Promise<RenderStatus | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    return {id: job.id, status: job.status, progress: job.progress, outputPath: job.outputPath, error: job.error};
  }

  async cancel(jobId: string): Promise<void> {
    const controller = this.controllers.get(jobId);
    const job = this.jobs.get(jobId);
    if (!controller || !job) return;
    controller.abort();
    job.status = 'cancelled' as RenderJobStatus;
    job.finishedAt = new Date().toISOString();
  }

  list(): ManagedRenderJob[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  private async prepareExternalScenes(
    project: AIEDITINGProject,
    options: RenderManagerOptions,
    job: ManagedRenderJob,
    update: (progress: number, message?: string) => void,
    signal: AbortSignal,
  ): Promise<AIEDITINGProject> {
    const external = project.tracks.flatMap(track => track.clips)
      .filter(clip => clip.renderer && clip.renderer.engine !== 'ffmpeg');
    if (!external.length) return project;

    const workDir = join(options.projectDir, 'renders', 'intermediate', job.id);
    await ensureDir(workDir);
    let done = 0;
    for (const clip of external) {
      if (signal.aborted) throw new Error('render cancelled');
      const hint = clip.renderer!;
      const adapter = this.registry.get(hint.engine);
      const health = await adapter.getHealth();
      if (!health.available) throw new Error(`engine ${hint.engine} is not available: ${health.reasons.join('; ')}`);
      const scenePath = join(workDir, `${clip.id}.mp4`);
      update(0.05 + (done / external.length) * 0.35, `engine ${hint.engine}: ${clip.id}`);
      const result = await adapter.render({
        mode: 'scene',
        projectDir: options.projectDir,
        outputPath: scenePath,
        scene: {
          template: hint.template ?? 'default',
          props: hint.scene ?? {},
          engineMetadata: hint.options,
        },
        width: options.preview ? Math.round((options.width ?? project.settings.width) / 2) : options.width ?? project.settings.width,
        height: options.preview ? Math.round((options.height ?? project.settings.height) / 2) : options.height ?? project.settings.height,
        fps: options.fps ?? project.settings.fps,
        duration: clip.duration,
        format: 'mp4',
        preview: options.preview,
        signal,
        onProgress: (value, message) => update(0.05 + ((done + value) / external.length) * 0.35, message ?? hint.engine),
      });
      if (result.status !== 'succeeded') throw new Error(`engine ${hint.engine} failed: ${result.error ?? 'unknown error'}`);
      const info = await inspectMedia(scenePath);
      const relativePath = relative(options.projectDir, scenePath).replace(/\\/g, '/');
      const asset = assetSchema.parse({
        id: `asset_${randomUUID()}`,
        kind: 'video',
        path: relativePath,
        name: `${clip.id}.mp4`,
        metadata: info.metadata,
        tags: ['intermediate', hint.engine],
      });
      project.assets.push(asset);
      clip.assetId = asset.id;
      clip.type = 'video';
      clip.in = 0;
      clip.out = info.metadata.duration;
      clip.renderer = undefined;
      done++;
    }
    return project;
  }
}
