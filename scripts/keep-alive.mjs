// Simple keep-alive wrapper for Next.js dev server
import { spawn } from 'child_process';

function start() {
  console.log(`[${new Date().toISOString()}] Starting Next.js dev server...`);
  const child = spawn('npx', ['next', 'dev', '--port', '3000'], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));

  child.on('exit', (code) => {
    console.log(`[${new Date().toISOString()}] Server exited with code ${code}. Restarting in 3s...`);
    setTimeout(start, 3000);
  });
}

start();
