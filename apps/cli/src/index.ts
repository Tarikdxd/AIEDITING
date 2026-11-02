// aiediting CLI — thin argument routing over the shared tool implementations
// in @aiediting/mcp-tools, plus the stdio MCP server and a verification command.
import {basename, resolve} from 'node:path';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {inspectMedia} from '@aiediting/media';
import {TOOL_SPECS, toolContext} from '@aiediting/mcp-tools';
import {startStdio} from '@aiediting/mcp-server';

const HELP = `aiediting — AI-native video editing, drivable end to end.

  aiediting init [dir] [--name n] [--width w] [--height h] [--fps f] [--duration d]
  aiediting project inspect [dir]
  aiediting project validate [dir]
  aiediting media import <file> [--dir projectDir] [--tags a,b]
  aiediting media inspect <file>
  aiediting media analyze <file>
  aiediting media thumbnail <file> [--out out.jpg] [--time t] [--width w]
  aiediting timeline [dir]
  aiediting plan [dir] --title t --prompt p --duration s [--width w --height h]
  aiediting render [dir] [--preview] [--out file.mp4]
  aiediting engines list | engines doctor [engineId]
  aiediting mcp                        start the stdio MCP server
  aiediting verify <file.mp4>          ffprobe-verify a deliverable
`;

interface ParsedArgs {
  positions: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positions: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      let value: string | boolean;
      if (eq !== -1) value = arg.slice(eq + 1);
      else if (index + 1 < argv.length && !argv[index + 1]!.startsWith('--')) value = argv[++index]!;
      else value = true;
      flags[key] = value;
    } else {
      positions.push(arg);
    }
  }
  return {positions, flags};
}

function numberOf(flags: Record<string, string | boolean>, key: string): number | undefined {
  const raw = flags[key];
  if (raw === undefined || raw === true) return undefined;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stringOf(flags: Record<string, string | boolean>, key: string): string | undefined {
  const raw = flags[key];
  return raw === undefined || raw === true ? undefined : String(raw);
}

async function call(name: string, args: Record<string, unknown> = {}, options: {silent?: boolean} = {}): Promise<unknown> {
  const tool = TOOL_SPECS.find(spec => spec.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  const result = await tool.run(args);
  if (!options.silent && result !== undefined && result !== null) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

async function openProject(dirArg?: string | true): Promise<string> {
  const dir = resolve(!dirArg || dirArg === true ? '.' : String(dirArg));
  await call('open_project', {dir});
  return dir;
}

function flagArgs(flags: Record<string, string | boolean>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys
    .map(key => [key, key === 'width' || key === 'height' || key === 'fps' || key === 'duration' || key === 'time'
      ? numberOf(flags, key)
      : stringOf(flags, key)])
    .filter(([, value]) => value !== undefined));
}

function newestRenderOutput(dir: string): string | undefined {
  const jobDir = resolve(dir, 'renders', 'jobs');
  if (!existsSync(jobDir)) return undefined;
  const files = readdirSync(jobDir).filter(file => file.endsWith('.json')).reverse();
  for (const file of files) {
    try {
      const job = JSON.parse(readFileSync(resolve(jobDir, file), 'utf8')) as {status?: string; outputPath?: string};
      if (job.outputPath && existsSync(job.outputPath)) return job.outputPath;
    } catch {
      // unreadable job file; keep looking
    }
  }
  return undefined;
}

async function runCommand(argv: string[]): Promise<number> {
  const {positions, flags} = parseArgs(argv);
  const [command = 'help', ...rest] = positions;

  switch (command) {
    case 'help':
    case '--help':
    case '-h': {
      process.stdout.write(HELP);
      return 0;
    }

    case 'init': {
      const dir = resolve(rest[0] ?? '.');
      const name = stringOf(flags, 'name') ?? (basename(dir) || 'project');
      await call('create_project', {dir, name, ...flagArgs(flags, ['width', 'height', 'fps', 'duration'])});
      return 0;
    }

    case 'project': {
      const sub = rest[0] ?? 'inspect';
      await openProject(rest[1] ?? (typeof flags.dir === 'string' ? flags.dir : undefined));
      if (sub === 'inspect') await call('inspect_project');
      else if (sub === 'validate') await call('validate_project');
      else throw new Error(`unknown project command: ${sub} (inspect | validate)`);
      return 0;
    }

    case 'media': {
      const sub = rest[0];
      if (!rest[1]) throw new Error('media commands need a file path');
      const file = resolve(rest[1]);
      if (sub === 'import') {
        const dir = resolve(String(flags.dir ?? '.'));
        if (!existsSync(resolve(dir, 'aiediting.project.json'))) {
          throw new Error(`no aiediting.project.json in ${dir}; run aiediting init there or pass --dir`);
        }
        await call('open_project', {dir});
        const tags = stringOf(flags, 'tags')?.split(',').map(tag => tag.trim()).filter(Boolean);
        await call('import_media', {path: file, ...(tags ? {tags} : {})});
      } else if (sub === 'inspect') {
        await call('inspect_media', {path: file});
      } else if (sub === 'analyze') {
        await call('analyze_media', {path: file});
      } else if (sub === 'thumbnail') {
        await call('generate_thumbnail', {
          path: file,
          out: resolve(String(flags.out ?? `${file}.thumb.jpg`)),
          ...flagArgs(flags, ['time', 'width']),
        });
      } else {
        throw new Error(`unknown media command: ${sub} (import | inspect | analyze | thumbnail)`);
      }
      return 0;
    }

    case 'timeline': {
      await openProject(rest[0] ?? (typeof flags.dir === 'string' ? flags.dir : undefined));
      await call('inspect_project');
      return 0;
    }

    case 'plan': {
      const title = stringOf(flags, 'title');
      const prompt = stringOf(flags, 'prompt');
      const duration = numberOf(flags, 'duration');
      if (!title || !prompt || !duration) throw new Error('plan needs --title, --prompt and --duration');
      if (rest[0]) {
        const dir = resolve(rest[0]);
        if (!existsSync(resolve(dir, 'aiediting.project.json'))) await call('create_project', {dir, name: basename(dir)});
        await openProject(dir);
      } else if (existsSync(resolve('aiediting.project.json'))) await openProject('.');
      await call('plan_video', {
        title,
        prompt,
        duration,
        ...flagArgs(flags, ['width', 'height']),
      });
      return 0;
    }

    case 'render': {
      await openProject(rest[0]);
      const outputPath = stringOf(flags, 'out');
      await call('render_video', {
        preview: flags.preview !== undefined,
        ...(outputPath ? {outputPath: resolve(outputPath)} : {}),
      });
      return 0;
    }

    case 'engines': {
      const sub = rest[0] ?? 'list';
      const list = (await call('list_engines', {}, {silent: true})) as Array<Record<string, unknown>>;
      if (sub === 'doctor') {
        const target = rest[1];
        const rows = target ? list.filter(engine => engine.id === target) : list;
        if (!rows.length) throw new Error(`unknown engine: ${target}`);
        for (const engine of rows) {
          const license = engine.license ? ` [${engine.license}]` : '';
          const reasons = Array.isArray(engine.reasons) && engine.reasons.length ? ` — ${(engine.reasons as string[]).join(' | ')}` : '';
          process.stdout.write(`${engine.available === true ? 'ok     ' : 'MISSING'} ${engine.id}${license}${reasons}\n`);
          const operations = engine.operations as string[] | undefined;
          if (operations?.length) process.stdout.write(`         ops: ${operations.join(', ')}\n`);
        }
        return rows.some(engine => engine.available === false) && process.env.AIEDITING_STRICT_DOCTOR === '1' ? 1 : 0;
      }
      return 0;
    }

    case 'mcp': {
      await startStdio();
      return 0; // resolves only when the transport closes
    }

    case 'verify': {
      const file = rest[0] ?? newestRenderOutput(resolve('.'));
      if (!file || !existsSync(file)) throw new Error('verify: no output file (pass a file path or run from a project with renders)');
      const info = await inspectMedia(resolve(file));
      const duration = info.metadata.duration ?? 0;
      if (duration < 0.5) throw new Error(`verify failed: duration ${duration}s (< 0.5s)`);
      if (!info.metadata.size) throw new Error('verify failed: file is empty');
      return 0;
    }

    default:
      throw new Error(`unknown command: ${command}\n\n${HELP}`);
  }
}

export async function main(): Promise<void> {
  try {
    process.exitCode = await runCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`aiediting: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

// Shared state across CLI commands (open project, render jobs).
export {toolContext};

// This module is the CLI entry point executed by bin.mjs; run on load.
await main();
