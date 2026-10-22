const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tasks = [
  { name: 'API server', directory: 'server', script: 'dev' },
  { name: 'Website', directory: 'client', script: 'dev' },
  { name: 'Mobile / Expo', directory: 'mobile', script: 'start' },
];
const children = [];
let stopping = false;

function stopAll(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));

for (const task of tasks) {
  console.log(`\n[${task.name}] starting...`);
  const child = spawn('npm', ['run', task.script], {
    cwd: path.join(root, task.directory),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push(child);

  child.on('error', (error) => {
    console.error(`[${task.name}] ${error.message}`);
    stopAll('SIGTERM', 1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${task.name}] exited${code === null ? '' : ` with code ${code}`}; stopping the other services.`);
      stopAll('SIGTERM', code || 1);
    }
  });
}
