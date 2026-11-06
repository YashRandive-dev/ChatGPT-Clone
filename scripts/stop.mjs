#!/usr/bin/env node
/**
 * Stops Kairo dev servers left running in the background (e.g. after closing a terminal),
 * freeing the web and API ports. Only stops processes that belong to this project.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let apiPort = 5000;
try {
  apiPort = Number(/^PORT=(\d+)/m.exec(readFileSync(path.join(root, 'backend/.env'), 'utf8'))?.[1] ?? 5000);
} catch {
  /* default */
}
const ports = [Number(process.env.WEB_PORT || 3000), Number(process.env.API_PORT || apiPort)];

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

// Every process whose command line points into this project (dev servers, watchers, npm wrappers).
const projectPids = sh('ps', ['-axo', 'pid=,command='])
  .split('\n')
  .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
  .filter((m) => m && Number(m[1]) !== process.pid && m[2].includes(root) && /(next|tsx|node)/.test(m[2]) && !m[2].includes('scripts/stop.mjs'))
  .map((m) => ({ pid: Number(m[1]), cmd: m[2] }));

// Processes listening on our ports (e.g. "next-server", whose command line has no path).
const portPids = ports.flatMap((p) =>
  sh('lsof', ['-tiTCP:' + p, '-sTCP:LISTEN'])
    .split('\n')
    .filter(Boolean)
    .map((pid) => ({ pid: Number(pid), cmd: `${sh('ps', ['-o', 'command=', '-p', pid])} (port ${p})` })),
);

const targets = [...new Map([...projectPids, ...portPids].map((t) => [t.pid, t])).values()].filter(
  // A port listener is only stopped if it is a Node process (never e.g. macOS AirPlay on :5000).
  (t) => projectPids.some((p) => p.pid === t.pid) || /node|next-server/.test(t.cmd),
);

if (!targets.length) {
  console.log(`Nothing to stop — ports ${ports.join(' and ')} are free.`);
  process.exit(0);
}
for (const t of targets) {
  try {
    process.kill(t.pid, 'SIGTERM');
    console.log(`Stopped ${t.pid}  ${t.cmd.replace(root, '.').slice(0, 110)}`);
  } catch {
    /* already exited */
  }
}
console.log(`\nPorts ${ports.join(' and ')} should now be free. Start again with: npm run dev`);
