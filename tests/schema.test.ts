import {describe, expect, it} from 'vitest';
import {createProject, loadProject, saveProject, validateProjectDocument} from '@aiediting/core';
import {addClip, addTrack, projectDuration} from '@aiediting/timeline';
import {PROJECT_FILE, projectJsonSchema} from '@aiediting/project-schema';
import {mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';

describe('canonical project format', () => {
  it('creates a schema-valid default project', () => {
    const project = createProject({name: 'uitest', width: 1920, height: 1080, fps: 30, duration: 10});
    const result = validateProjectDocument(project);
    expect(result.success).toBe(true);
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(project.id).toMatch(/^project_/);
    expect(project.tracks).toEqual([]);
  });

  it('rejects broken documents', () => {
    const broken = validateProjectDocument({name: 42});
    expect(broken.success).toBe(false);
    expect(broken.issues.length).toBeGreaterThan(0);
  });

  it('round-trips through disk unchanged', async () => {
    const dir = join(process.cwd(), 'tests', '.tmp', 'schema', 'round-trip');
    rmSync(dir, {recursive: true, force: true});
    const project = createProject({name: 'rt', width: 1280, height: 720, fps: 30, duration: 6});
    const track = addTrack(project, {type: 'video', name: 'V', index: 0});
    const clip = addClip(project, track.id, {type: 'color', duration: 3, color: '#204060'});
    expect(clip.start).toBe(0);
    const savedTo = await saveProject(project, join(dir, PROJECT_FILE));
    expect(savedTo.endsWith(PROJECT_FILE)).toBe(true);
    const opened = await loadProject(dir);
    expect(opened.project.name).toBe('rt');
    expect(projectDuration(opened.project)).toBe(6);
    expect(opened.project.tracks[0]?.clips).toHaveLength(1);
  });

  it('exposes the strict JSON schema meant for aiediting.project.schema.json', () => {
    const schema = projectJsonSchema() as {$ref: string; definitions: Record<string, Record<string, unknown>>};
    const root = schema.definitions?.AIEDITINGProject;
    expect(root?.type).toBe('object');
    const properties = root?.properties as Record<string, unknown> | undefined;
    expect(properties && 'tracks' in properties).toBe(true);
    expect(properties && 'settings' in properties).toBe(true);
  });
});
