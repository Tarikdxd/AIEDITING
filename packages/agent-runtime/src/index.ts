import {join} from 'node:path';
import {createProject, inspectProject, loadProject, saveProject, validateProjectDocument} from '@aiediting/core';
import {importAsset} from '@aiediting/asset-manager';
import {RenderManager, type RenderManagerOptions} from '@aiediting/renderer';
import {planBrief, planWithLlm, type VideoBrief} from '@aiediting/planner';
import {addTrack} from '@aiediting/timeline';
import type {AIEDITINGProject} from '@aiediting/project-schema';
import type {AdapterRegistry} from '@aiediting/adapter-sdk';

export interface AgentRuntimeOptions {
  projectDir: string;
  registry: AdapterRegistry;
}

export class AgentRuntime {
  readonly projectDir: string;
  readonly registry: AdapterRegistry;

  constructor(options: AgentRuntimeOptions) {
    this.projectDir = options.projectDir;
    this.registry = options.registry;
  }

  async create(name: string, options: {width?: number; height?: number; fps?: number; duration?: number; background?: string} = {}) {
    const project = createProject({name, ...options});
    addTrack(project, {type: 'video', name: 'Primary', index: 0});
    addTrack(project, {type: 'audio', name: 'Audio', index: 1});
    addTrack(project, {type: 'text', name: 'Titles', index: 2});
    addTrack(project, {type: 'subtitle', name: 'Subtitles', index: 3});
    await saveProject(project, join(this.projectDir, 'aiediting.project.json'));
    return project;
  }

  async open(fileOrDir = this.projectDir) {
    return loadProject(fileOrDir);
  }

  inspect(project: AIEDITINGProject) {
    return inspectProject(project);
  }

  validate(project: AIEDITINGProject) {
    return validateProjectDocument(project);
  }

  async importMedia(source: string, options: {tags?: string[]} = {}) {
    const {project, path} = await this.open();
    const asset = await importAsset(this.projectDir, project, source, options);
    await saveProject(project, path);
    return asset;
  }

  async save(project: AIEDITINGProject) {
    return saveProject(project, join(this.projectDir, 'aiediting.project.json'));
  }

  async plan(brief: VideoBrief, options: {llm?: boolean} = {}) {
    const result = options.llm ? await planWithLlm(brief) : planBrief(brief);
    await this.save(result.project);
    return result;
  }

  async render(options: Omit<RenderManagerOptions, 'registry' | 'projectDir' | 'project'> & {project?: AIEDITINGProject} = {}) {
    const opened = options.project
      ? {project: options.project}
      : await this.open();
    const manager = new RenderManager(this.registry, join(this.projectDir, 'renders', 'jobs'));
    return manager.render({...options, project: opened.project, projectDir: this.projectDir, registry: this.registry});
  }

  health() {
    return this.registry.health();
  }
}
