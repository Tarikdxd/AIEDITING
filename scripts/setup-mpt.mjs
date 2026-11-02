// Prepares the vendored MoneyPrinterTurbo engine:
//   1. clones https://github.com/harry0703/MoneyPrinterTurbo into vendor/MoneyPrinterTurbo (pinned upstream tip)
//   2. creates config.toml from config.example.toml (keep credentials there, never commit it)
//   3. creates a Python 3.11 venv at vendor/.mpt-venv and installs requirements
// Run: node scripts/setup-mpt.mjs
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const MPT_PIN = '84e99b3168ccd0ce4ebe58c9703a4fea3b4f32ba'; // reviewed integration revision
const root = process.cwd();
const vendor = join(root, 'vendor', 'MoneyPrinterTurbo');
if (!existsSync(vendor)) {
  console.log('[mpt] cloning MoneyPrinterTurbo ...');
  execFileSync('git', ['clone', '--depth', '1', 'https://github.com/harry0703/MoneyPrinterTurbo.git', vendor], {stdio: 'inherit'});
  try {
    execFileSync('git', ['-C', vendor, 'fetch', '--depth', '1', 'origin', MPT_PIN], {stdio: 'inherit'});
    execFileSync('git', ['-C', vendor, 'checkout', '--detach', MPT_PIN], {stdio: 'inherit'});
    console.log(`[mpt] pinned to ${MPT_PIN.slice(0, 12)}`);
  } catch {
    console.log('[mpt] pin fetch failed; staying on default branch tip');
  }
}
if (!existsSync(join(vendor, 'cli.py'))) {
  console.error('[mpt] vendor clone incomplete; delete vendor/MoneyPrinterTurbo and rerun');
  process.exit(1);
}

if (!existsSync(join(vendor, 'config.toml'))) {
  copyFileSync(join(vendor, 'config.example.toml'), join(vendor, 'config.toml'));
  console.log('[mpt] wrote config.toml (copy of config.example.toml)');
}

const venv = join(root, 'vendor', '.mpt-venv');
const venvPython = process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python');
const userPython = process.env.AIEDITING_PYTHON;

function tryVenv(python) {
  try {
    execFileSync(python, ['--version'], {stdio: 'pipe'});
    return python;
  } catch {
    return null;
  }
}

let base = userPython && existsSync(userPython) ? userPython : null;
if (!base) base = tryVenv('python') ?? tryVenv('python3') ?? tryVenv('C:/Python311/python.exe');
if (!base) {
  console.error('[mpt] no python found; install Python 3.11 or set AIEDITING_PYTHON');
  process.exit(1);
}
console.log(`[mpt] using python: ${base}`);

if (!existsSync(venvPython)) {
  console.log('[mpt] creating venv ...');
  execFileSync(base, ['-m', 'venv', venv], {stdio: 'inherit'});
}

console.log('[mpt] installing python dependencies (this can take a few minutes) ...');
execFileSync(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'], {
  cwd: vendor,
  stdio: 'inherit',
  env: {...process.env, PIP_DEFAULT_TIMEOUT: '180'},
});

console.log('[mpt] done. The adapter runs cli.py from this environment.');
console.log('[mpt] Optional: add LLM / material provider keys to vendor/MoneyPrinterTurbo/config.toml.');
