import type {AIEDITINGProject, ExportSettings} from '@aiediting/project-schema';

export const ENGINE_OPERATIONS = [
  'project.render',
  'scene.render',
  'media.inspect',
  'media.transcode',
  'media.audio',
  'graphics.html',
  'graphics.react',
  'graphics.vector',
  'animation.2d',
  'animation.3d',
  'character.animation',
  'compositing',
  'encoding',
  'subtitles',
] as const;

export type EngineOperation = (typeof ENGINE_OPERATIONS)[number];

export type EngineFormat = 'mp4' | 'mov' | 'webm' | 'png-sequence' | 'gif';

export interface SceneSpec {
  template: string;
  props?: Record<string, unknown>;
  engineMetadata?: Record<string, unknown>;
  html?: string;
  source?: string;
}

export interface EngineCapabilities {
  id: string;
  name: string;
  version: string;
  operations: EngineOperation[];
  formats: EngineFormat[];
  maxWidth: number;
  maxHeight: number;
  maxFps: number;
  supportsAlpha: boolean;
  supportsAudio: boolean;
  deterministic: boolean;
  gpu: boolean;
  sceneTemplates: string[];
  requirements: string[];
  license: string;
  notes?: string;
}

export interface EngineHealth {
  available: boolean;
  version?: string;
  path?: string;
  reasons: string[];
  checkedAt: string;
}

export interface SceneRenderRequest {
  mode: 'scene';
  projectDir: string;
  outputPath: string;
  scene: SceneSpec;
  width: number;
  height: number;
  fps: number;
  duration: number;
  format: EngineFormat;
  preview?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number, message?: string) => void;
}

export interface ProjectRenderRequest {
  mode: 'project';
  project: AIEDITINGProject;
  projectDir: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  exportSettings: ExportSettings;
  preview?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number, message?: string) => void;
  sceneRenderer?: SceneRenderer;
}

export type RenderRequest = SceneRenderRequest | ProjectRenderRequest;

export type SceneRenderer = (request: Omit<SceneRenderRequest, 'mode' | 'projectDir' | 'width' | 'height' | 'fps' | 'signal'> & {
  signal?: AbortSignal;
}) => Promise<string>;

export type RenderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RenderJob {
  id: string;
  engineId: string;
  status: RenderJobStatus;
  progress: number;
  outputPath: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  logs: string[];
}

export interface RenderStatus {
  id: string;
  status: RenderJobStatus;
  progress: number;
  outputPath: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EngineAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  initialize(): Promise<void>;
  getHealth(): Promise<EngineHealth>;
  getCapabilities(): Promise<EngineCapabilities>;
  validate(project: AIEDITINGProject): Promise<ValidationResult>;
  render(request: RenderRequest): Promise<RenderJob>;
  cancel(jobId: string): Promise<void>;
}

export abstract class BaseAdapter implements EngineAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  async initialize(): Promise<void> {}
  abstract getHealth(): Promise<EngineHealth>;
  abstract getCapabilities(): Promise<EngineCapabilities>;
  async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    return {valid: true, errors: [], warnings: []};
  }
  abstract render(request: RenderRequest): Promise<RenderJob>;
  async cancel(_jobId: string): Promise<void> {}
}

export interface SelectionRequest {
  operation: EngineOperation;
  width: number;
  height: number;
  fps: number;
  format?: EngineFormat;
  requiresAlpha?: boolean;
  requiresAudio?: boolean;
  requiresDeterministic?: boolean;
  preferred?: string[];
}

export interface SelectionResult {
  adapter: EngineAdapter;
  capabilities: EngineCapabilities;
  score: number;
  reasons: string[];
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, EngineAdapter>();

  register(adapter: EngineAdapter): this {
    if (this.adapters.has(adapter.id)) throw new Error(`adapter already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  get(id: string): EngineAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`unknown engine: ${id}`);
    return adapter;
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  list(): EngineAdapter[] {
    return [...this.adapters.values()];
  }

  async health() {
    return Promise.all([...this.adapters.values()].map(async adapter => ({
      id: adapter.id,
      name: adapter.name,
      version: adapter.version,
      health: await adapter.getHealth(),
    })));
  }

  async capabilities() {
    return Promise.all([...this.adapters.values()].map(async adapter => ({
      ...await adapter.getCapabilities(),
      health: await adapter.getHealth(),
    })));
  }

  async select(request: SelectionRequest): Promise<SelectionResult> {
    const candidates = await Promise.all([...this.adapters.values()].map(async adapter => {
      const capabilities = await adapter.getCapabilities();
      const health = await adapter.getHealth();
      return {adapter, capabilities, health};
    }));
    const scored: SelectionResult[] = [];
    for (const candidate of candidates) {
      const {adapter, capabilities, health} = candidate;
      const reasons: string[] = [];
      if (!health.available) continue;
      if (!capabilities.operations.includes(request.operation)) continue;
      if (capabilities.maxWidth < request.width || capabilities.maxHeight < request.height) continue;
      if (capabilities.maxFps < request.fps) continue;
      if (request.format && !capabilities.formats.includes(request.format)) continue;
      if (request.requiresAlpha && !capabilities.supportsAlpha) continue;
      if (request.requiresAudio && !capabilities.supportsAudio) continue;
      if (request.requiresDeterministic && !capabilities.deterministic) continue;
      let score = 10;
      if (request.preferred?.includes(adapter.id)) {
        score += 100 - request.preferred.indexOf(adapter.id) * 5;
        reasons.push('preferred');
      }
      if (capabilities.operations.includes('project.render')) score += 2;
      if (capabilities.deterministic) score += 1;
      scored.push({adapter, capabilities, score, reasons});
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
      throw new Error(`no available engine satisfies ${request.operation} ${request.width}x${request.height}@${request.fps}`);
    }
    return best;
  }
}
