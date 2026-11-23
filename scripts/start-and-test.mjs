import { spawn } from 'child_process';
import http from 'http';

const jar = new Map(); // cookie jar

function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cookieStr = [...jar.values()].join('; ');
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { ...headers, Cookie: cookieStr },
      timeout: 15000,
    };
    const r = http.request(opts, (res) => {
      // Store cookies
      const sc = res.headers['set-cookie'];
      if (sc) for (const c of sc) { const [nameVal] = c.split(';'); const [n, ...v] = nameVal.split('='); jar.set(n.trim(), n.trim() + '=' + v.join('=')); }
      
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        res.resume();
        req(loc.startsWith('http') ? new URL(loc).pathname : loc, { method: 'GET', body, headers }).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

function waitForServer(maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = http.request({ hostname: '127.0.0.1', port: 3000, path: '/', method: 'HEAD', timeout: 3000 }, (res) => { s.destroy(); resolve(); });
      s.on('error', () => { if (Date.now() - start > maxMs) { reject(new Error('Server did not start')); return; } setTimeout(check, 500); });
      s.on('timeout', () => { s.destroy(); setTimeout(check, 500); });
      s.end();
    };
    check();
  });
}

async function runTests() {
  console.log('=== 1. AUTH: Admin login ===');
  const csrfRes = await req('/api/auth/csrf');
  console.log(`  CSRF: ${csrfRes.status}`);
  const { csrfToken } = JSON.parse(csrfRes.body);

  const loginRes = await req('/api/auth/callback/credentials', {
    method: 'POST',
    body: new URLSearchParams({ email: 'admin@nakoyonjo.ac.ke', password: 'admin123', csrfToken }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log(`  Login: ${loginRes.status}`);

  const sessionRes = await req('/api/auth/session');
  const session = JSON.parse(sessionRes.body);
  console.log(`  Session: ${session.user ? '✅ ' + session.user.role + ' - ' + session.user.name : '❌ FAILED'}`);

  if (!session.user) { console.log('  Stopping tests.'); return; }

  console.log('\n=== 2. API ROUTES ===');
  const endpoints = [
    { path: '/api/dashboard', name: 'Dashboard' },
    { path: '/api/students', name: 'Students' },
    { path: '/api/classes', name: 'Classes' },
    { path: '/api/teachers', name: 'Teachers' },
    { path: '/api/subjects', name: 'Subjects' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await req(ep.path);
      const data = JSON.parse(res.body);
      const keys = Object.keys(data).join(', ');
      const mark = res.status === 200 ? '✅' : '⚠️';
      console.log(`  ${mark} ${ep.name}: ${res.status} [${keys.substring(0, 60)}]`);
    } catch (e) {
      console.log(`  ❌ ${ep.name}: ${e.message}`);
    }
  }

  console.log('\n=== 3. AUTH: Teacher login (new session) ===');
  jar.clear(); // clear cookies for new login
  const csrf2 = await req('/api/auth/csrf');
  const { csrfToken: ct2 } = JSON.parse(csrf2.body);
  await req('/api/auth/callback/credentials', {
    method: 'POST',
    body: new URLSearchParams({ email: 'james.mwangi@nakoyonjo.ac.ke', password: 'teacher123', csrfToken: ct2 }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const tSession = JSON.parse((await req('/api/auth/session')).body);
  console.log(`  Session: ${tSession.user ? '✅ ' + tSession.user.role + ' - ' + tSession.user.name : '❌ FAILED'}`);

  console.log('\n  ✅ ALL TESTS COMPLETE');
}

console.log('Starting server...');
const server = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', '3000'], {
  cwd: '/home/z/my-project', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
});
server.stdout.on('data', (d) => process.stderr.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

waitForServer().then(() => {
  console.log('Server ready. Running tests...\n');
  return runTests();
}).then(() => {
  server.kill(); process.exit(0);
}).catch((e) => {
  console.error('Fatal:', e.message); server.kill(); process.exit(1);
});
