// End-to-end MCP stdio smoke: initialize -> tools/list -> create_project -> add_clip -> validate.
import {spawn} from 'node:child_process';
import {mkdirSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = process.cwd();
const dir = resolve(root, 'tests', '.tmp', 'mcp-smoke', 'p1');
rmSync(resolve(root, 'tests', '.tmp', 'mcp-smoke'), {recursive: true, force: true});
mkdirSync(dir, {recursive: true});

const child = spawn(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'packages', 'mcp-server', 'src', 'bin.ts')], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let pending = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { pending += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

const responses = new Map();
let nextId = 1;
let sendCount = 0;

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function sendRequest(method, params) {
  const id = nextId++;
  sendCount++;
  send({jsonrpc: '2.0', id, method, params});
  return id;
}

async function expect(id, label, seconds = 30) {
  const startedAt = Date.now();
  while (!responses.has(id)) {
    drain();
    if (Date.now() - startedAt > seconds * 1000 || child.exitCode !== null) {
      process.exitCode = 1;
      throw new Error(`${label}: no response (exit=${child.exitCode})\nstderr:\n${stderr.slice(-2000)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const response = responses.get(id);
  if (response.error) throw new Error(`${label}: ${JSON.stringify(response.error).slice(0, 400)}`);
  const text = response.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : response.result;
}

function drain() {
  let end;
  while ((end = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined && (message.result || message.error)) responses.set(message.id, message);
    } catch {
      // not JSON (banner); ignore
    }
  }
}

const protocolVersion = '2025-06-18';
const id1 = sendRequest('initialize', {
  protocolVersion,
  capabilities: {},
  clientInfo: {name: 'aiediting-smoke', version: '0.0.0'},
});
const init = await expect(id1, 'initialize');
if (!init.serverInfo?.name) throw new Error(`initialize returned odd serverInfo: ${JSON.stringify(init).slice(0, 200)}`);
send({jsonrpc: '2.0', method: 'notifications/initialized'});

const id2 = sendRequest('tools/list', {});
const tools = await expect(id2, 'tools/list');
console.log(`tools/list: ${tools.tools.length} tools`);
if (tools.tools.length < 20) throw new Error(`expected at least 20 tools, got ${tools.tools.length}`);

const id3 = sendRequest('tools/call', {name: 'create_project', arguments: {dir, name: 'mcp-smoke'}});
const created = await expect(id3, 'create_project', 60);
const titles = (created.project?.tracks ?? []).find(track => track.name === 'Titles');
if (!titles?.id) throw new Error(`created project has no Titles track: ${JSON.stringify(created.project?.tracks ?? {}).slice(0, 300)}`);

const id4 = sendRequest('tools/call', {
  name: 'add_clip',
  arguments: {trackId: titles.id, clip: {type: 'text', text: 'MCP smoke title', duration: 2}},
});
const clip = await expect(id4, 'add_clip');
if (!clip.clipId) throw new Error('add_clip did not return a clipId');

const id5 = sendRequest('tools/call', {name: 'validate_project', arguments: {}});
const validation = await expect(id5, 'validate_project');
console.log(`validate: ${JSON.stringify(validation).slice(0, 160)}`);

child.kill();
console.log('MCP stdio smoke OK');
