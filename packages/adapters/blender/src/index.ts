import {existsSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {
  BaseAdapter,
  type EngineCapabilities,
  type EngineHealth,
  type RenderJob,
  type RenderRequest,
  type SceneRenderRequest,
  type ValidationResult,
} from '@aiediting/adapter-sdk';
import {ensureDir, ffmpeg, inspectMedia, run} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';

function findBlender(): string | null {
  if (process.env.AIEDITING_BLENDER && existsSync(process.env.AIEDITING_BLENDER)) return process.env.AIEDITING_BLENDER;
  const candidates = process.platform === 'win32'
    ? [
        'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
        'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
        'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe',
        'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
        'C:/Program Files/Blender Foundation/Blender 4.1/blender.exe',
        'C:/Program Files/Blender Foundation/Blender 4.0/blender.exe',
      ]
    : ['/usr/bin/blender', '/usr/local/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender'];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

const PYTHON = String.raw`
import bpy, sys, math, os, argparse
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
p = argparse.ArgumentParser()
p.add_argument("--out", required=True)
p.add_argument("--width", type=int, default=1920)
p.add_argument("--height", type=int, default=1080)
p.add_argument("--fps", type=int, default=30)
p.add_argument("--duration", type=float, default=4)
p.add_argument("--text", default="AIEDITING")
p.add_argument("--color", default="#8b5cf6")
p.add_argument("--bg", default="#08080d")
args = p.parse_args(argv)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.fps = args.fps
scene.frame_start = 1
scene.frame_end = max(1, int(args.duration * args.fps))
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(args.out, "frame_")
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
# World
world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.03, 0.05, 1)
scene.world = world
# Camera
cam_data = bpy.data.cameras.new("Camera")
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -7, 2.2)
cam.rotation_euler = (math.radians(78), 0, 0)
scene.camera = cam
# Light
light_data = bpy.data.lights.new("Key", "AREA")
light_data.energy = 900
light_data.size = 5
light = bpy.data.objects.new("Key", light_data)
scene.collection.objects.link(light)
light.location = (-3, -4, 5)
# Text
curve = bpy.data.curves.new("Title", type="FONT")
curve.body = args.text
curve.align_x = "CENTER"
curve.align_y = "CENTER"
curve.extrude = 0.08
curve.bevel_depth = 0.01
text = bpy.data.objects.new("Title", curve)
scene.collection.objects.link(text)
mat = bpy.data.materials.new("Ink")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
hexcolor = args.color.lstrip("#")
r, g, b = [int(hexcolor[i:i+2], 16) / 255 for i in (0, 2, 4)]
if bsdf:
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = 0.3
curve.materials.append(mat)
text.rotation_euler = (math.radians(90), 0, 0)
# Animation: a slow turn
text.keyframe_insert(data_path="rotation_euler", frame=1)
text.rotation_euler[2] = math.radians(10)
text.keyframe_insert(data_path="rotation_euler", frame=scene.frame_end)
bpy.ops.render.render(animation=True)
`;

export class BlenderAdapter extends BaseAdapter {
  readonly id = 'blender';
  readonly name = 'Blender';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const blender = findBlender();
    if (!blender) {
      return {available: false, reasons: ['Blender not found; set AIEDITING_BLENDER or install Blender'], checkedAt: new Date().toISOString()};
    }
    try {
      const result = await run(blender, ['--version'], {timeoutMs: 30_000});
      return {available: true, version: result.stdout.split('\n')[0]?.trim(), path: blender, reasons: [], checkedAt: new Date().toISOString()};
    } catch (error) {
      return {available: false, path: blender, reasons: [(error as Error).message], checkedAt: new Date().toISOString()};
    }
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'animation.3d', 'animation.2d'],
      formats: ['mp4', 'mov', 'png-sequence'],
      maxWidth: 3840,
      maxHeight: 2160,
      maxFps: 120,
      supportsAlpha: true,
      supportsAudio: false,
      deterministic: true,
      gpu: true,
      sceneTemplates: ['text3d'],
      requirements: ['Blender 4.x', 'ffmpeg'],
      license: 'GPL-3.0-or-later',
      notes: 'Headless Blender renders a generated 3D scene to PNG frames; FFmpeg encodes the result.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('Blender renders scenes; the renderer composes the project');
    return this.renderScene(request);
  }

  private async renderScene(request: SceneRenderRequest): Promise<RenderJob> {
    const job: RenderJob = {
      id: `job_${crypto.randomUUID()}`,
      engineId: this.id,
      status: 'running',
      progress: 0.1,
      outputPath: request.outputPath,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    const temp = await mkdtemp(join(tmpdir(), 'aiediting-blender-'));
    try {
      const blender = findBlender();
      if (!blender) throw new Error('Blender not found; set AIEDITING_BLENDER');
      const output = resolve(request.outputPath);
      await ensureDir(dirname(output));
      await ensureDir(join(temp, 'frames'));
      const script = join(temp, 'scene.py');
      await writeFile(script, PYTHON, 'utf8');
      const props = request.scene.props ?? {};
      job.progress = 0.2;
      request.onProgress?.(0.2, 'blender render');
      await run(blender, [
        '-b', '--factory-startup', '--python', script, '--',
        '--out', join(temp, 'frames'),
        '--width', String(request.width),
        '--height', String(request.height),
        '--fps', String(request.fps),
        '--duration', String(request.duration),
        '--text', String(props.text ?? 'AIEDITING'),
        '--color', String(props.color ?? '#8b5cf6'),
        '--bg', String(props.bg ?? '#08080d'),
      ], {
        timeoutMs: 30 * 60_000,
        signal: request.signal,
        onStderr: chunk => {
          if (chunk.trim()) job.logs.push(chunk.trim().slice(0, 500));
          if (job.logs.length > 100) job.logs.shift();
        },
      });
      job.progress = 0.75;
      request.onProgress?.(0.75, 'encode');
      await ffmpeg([
        '-framerate', String(request.fps),
        '-i', join(temp, 'frames', 'frame_%04d.png'),
        '-t', String(request.duration),
        '-c:v', 'libx264', '-preset', request.preview ? 'veryfast' : 'medium', '-crf', request.preview ? '24' : '18',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
      ], {timeoutMs: 15 * 60_000, signal: request.signal});
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < request.duration - 0.35) {
        throw new Error(`Blender output duration ${info.metadata.duration ?? 'unknown'}s`);
      }
      job.status = 'succeeded';
      job.progress = 1;
      job.finishedAt = new Date().toISOString();
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.finishedAt = new Date().toISOString();
      throw error;
    } finally {
      await rm(temp, {recursive: true, force: true});
    }
  }
}

export default BlenderAdapter;
