import { spawn } from 'child_process';
import http from 'http';

function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const token = globalThis.__token || '';
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      timeout: 15000,
    };
    const r = http.request(opts, (res) => {
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
  // 1. LOGIN
  console.log('=== 1. TOKEN LOGIN (admin) ===');
  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@nakoyonjo.ac.ke', password: 'admin123' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const loginData = JSON.parse(loginRes.body);
  console.log(`  Status: ${loginRes.status}`);
  if (!loginData.ok) { console.log('  ❌ LOGIN FAILED'); return; }
  globalThis.__token = loginData.token;
  console.log(`  Token: ${loginData.token.substring(0, 30)}...`);
  console.log(`  User: ${loginData.user.name} (${loginData.user.role})`);

  // 2. API ROUTES WITH TOKEN
  console.log('\n=== 2. API ROUTES (Bearer token) ===');
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
      const mark = res.status === 200 ? '✅' : '⚠️';
      console.log(`  ${mark} ${ep.name}: ${res.status} [${Object.keys(data).join(', ').substring(0, 60)}]`);
    } catch (e) { console.log(`  ❌ ${ep.name}: ${e.message}`); }
  }

  // 3. NO TOKEN → 401
  console.log('\n=== 3. UNAUTHORIZED (no token) ===');
  globalThis.__token = '';
  const noAuth = await req('/api/dashboard');
  console.log(`  Dashboard w/o token: ${noAuth.status} ${noAuth.status === 401 ? '✅' : '❌'}`);

  // 4. TEACHER LOGIN
  console.log('\n=== 4. TEACHER LOGIN ===');
  const tLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'james.mwangi@nakoyonjo.ac.ke', password: 'teacher123' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const tData = JSON.parse(tLogin.body);
  globalThis.__token = tData.token;
  console.log(`  Teacher: ${tData.ok ? '✅ ' + tData.user.name + ' (' + tData.user.role + ')' : '❌ FAILED'}`);

  // 5. BAD CREDENTIALS
  console.log('\n=== 5. BAD CREDENTIALS ===');
  globalThis.__token = '';
  const bad = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@nakoyonjo.ac.ke', password: 'wrong' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const badData = JSON.parse(bad.body);
  console.log(`  Wrong password: ${!badData.ok && bad.status === 401 ? '✅ Rejected' : '❌ Should have failed'}`);

  console.log('\n  ✅ ALL TESTS COMPLETE');
}

console.log('Starting server...');
const server = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', '3000'], {
  cwd: '/home/z/my-project', stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stderr.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

waitForServer().then(() => {
  console.log('Server ready.\n');
  return runTests();
}).then(() => { server.kill(); process.exit(0); })
  .catch((e) => { console.error('Fatal:', e.message); server.kill(); process.exit(1); });
