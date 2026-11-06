#!/usr/bin/env node
/**
 * Starts the Kairo API and web app together.
 *  - Checks both ports first and explains what to do if one is busy.
 *  - Prefixes each line with [api] / [web].
 *  - Ctrl+C, or either app crashing, stops BOTH (no orphaned servers left holding ports).
 *
 * Optional overrides: API_PORT=5003 WEB_PORT=3002 npm run dev
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function envFilePort() {
  try {
    const match = /^PORT=(\d+)/m.exec(readFileSync(path.join(root, 'backend/.env'), 'utf8'));
    return match ? Number(match[1]) : 5000;
  } catch {
    return 5000;
  }
}

const apiPort = Number(process.env.API_PORT || envFilePort());
const webPort = Number(process.env.WEB_PORT || 3000);

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '::');
  });
}

const busy = [];
for (const [name, port] of [['API', apiPort], ['Web', webPort]]) if (!(await isFree(port))) busy.push(`${name} port ${port}`);
if (busy.length) {
  console.error(`\n✖ ${busy.join(' and ')} ${busy.length > 1 ? 'are' : 'is'} already in use.`);
  console.error('  Another Kairo dev server is probably still running (e.g. from a closed terminal).');
  console.error('  Stop it with:  npm run stop      then run:  npm run dev\n');
  process.exit(1);
}

const color = { api: '\x1b[36m', web: '\x1b[35m', reset: '\x1b[0m' };
const children = [];
let shuttingDown = false;

function start(name, dir, extraEnv) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, dir),
    env: { ...process.env, FORCE_COLOR: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so we can stop the whole tree
  });
  const prefix = `${color[name]}[${name}]${color.reset} `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`\n${prefix}exited (${signal ?? `code ${code}`}). Stopping the other app…`);
      shutdown(code || 1);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    process.exit(code);
  }, 3000).unref();
  Promise.all(children.map((c) => (c.exitCode !== null ? null : new Promise((r) => c.once('exit', r))))).then(() => process.exit(code));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0)); // terminal closed

const apiEnv = { PORT: String(apiPort) };
const webEnv = { PORT: String(webPort) };
if (process.env.WEB_PORT) apiEnv.FRONTEND_URL = `http://localhost:${webPort}`;
if (process.env.API_PORT) webEnv.NEXT_PUBLIC_API_URL = `http://localhost:${apiPort}`;

console.log(`Starting Kairo → web http://localhost:${webPort}  ·  api http://localhost:${apiPort}  (Ctrl+C stops both)\n`);
start('api', 'backend', apiEnv);
start('web', 'frontend', webEnv);
