import http from 'http';

const BASE_HOST = '127.0.0.1';
const BASE_PORT = 3000;

function req(path, { method = 'GET', body, headers = {}, cookie = '' } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path,
      method,
      headers: { ...headers, Cookie: cookie },
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

async function main() {
  const endpoints = [
    '/api/dashboard',
    '/api/students',
    '/api/classes',
    '/api/teachers',
    '/api/subjects',
    '/api/attendance?date=2026-08-10&classId=test',
  ];

  // First, get a valid session cookie
  console.log('=== Getting session cookie ===');
  const csrfRes = await req('/api/auth/csrf');
  const { csrfToken } = JSON.parse(csrfRes.body);
  const cookies = [];
  
  // Login to get session
  const loginRes = await req('/api/auth/callback/credentials', {
    method: 'POST',
    body: new URLSearchParams({ email: 'admin@nakoyonjo.ac.ke', password: 'admin123', csrfToken }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  // Extract session cookie from login
  const sc = loginRes.headers['set-cookie'];
  if (sc) {
    for (const c of sc) cookies.push(c.split(';')[0]);
  }
  const cookieStr = cookies.join('; ');
  console.log(`  Session cookie obtained: ${cookieStr.substring(0, 50)}...\n`);

  for (const ep of endpoints) {
    try {
      const res = await req(ep, { cookie: cookieStr });
      const preview = res.body.substring(0, 150);
      console.log(`${ep} => ${res.status}`);
      console.log(`  ${preview}${res.body.length > 150 ? '...' : ''}`);
      console.log('');
    } catch (e) {
      console.log(`${ep} => ERROR: ${e.message}\n`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
