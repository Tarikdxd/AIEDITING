import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {chromium, type Browser} from 'playwright-core';

const WINDOWS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
];

const UNIX = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

export function findBrowser(): string | null {
  if (process.env.AIEDITING_BROWSER && existsSync(process.env.AIEDITING_BROWSER)) return process.env.AIEDITING_BROWSER;
  for (const candidate of process.platform === 'win32' ? WINDOWS : UNIX) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = findBrowser();
  return chromium.launch({
    executablePath: executablePath ?? undefined,
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
}

export async function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

export async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error(`http endpoint did not become ready: ${url}`);
}
