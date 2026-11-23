import http from 'http';

const BASE = 'http://127.0.0.1:3000';
const cookies = [];

function fetch(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        ...headers,
        Cookie: cookies.join('; '),
      },
      timeout: 15000,
    };
    const req = http.request(opts, (res) => {
      // Collect Set-Cookie headers
      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        for (const sc of setCookies) {
          cookies.push(sc.split(';')[0]);
        }
      }
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const location = res.headers.location;
        console.log(`  Redirect -> ${location} (${res.statusCode})`);
        fetch(location.startsWith('http') ? location : location, { method, body, headers })
          .then(resolve)
          .catch(reject);
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data, cookies: [...cookies] });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== STEP 1: Get CSRF token ===');
  const csrfRes = await fetch('/api/auth/csrf');
  console.log(`  Status: ${csrfRes.status}`);
  const { csrfToken } = JSON.parse(csrfRes.body);
  console.log(`  CSRF Token: ${csrfToken.substring(0, 20)}...`);

  console.log('\n=== STEP 2: Sign in with credentials ===');
  const loginBody = new URLSearchParams({
    email: 'admin@nakoyonjo.ac.ke',
    password: 'admin123',
    csrfToken,
  }).toString();

  const loginRes = await fetch('/api/auth/callback/credentials', {
    method: 'POST',
    body: loginBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log(`  Status: ${loginRes.status}`);
  console.log(`  Cookies: ${loginRes.cookies.length > 0 ? loginRes.cookies.map(c => c.split('=')[0]).join(', ') : 'none'}`);
  if (loginRes.status >= 300 && loginRes.status < 400) {
    console.log(`  Redirect: ${loginRes.headers.location}`);
  }

  console.log('\n=== STEP 3: Check session ===');
  const sessionRes = await fetch('/api/auth/session');
  console.log(`  Status: ${sessionRes.status}`);
  console.log(`  Body: ${sessionRes.body}`);

  if (JSON.parse(sessionRes.body).user) {
    console.log('\n  ✅ SIGN-IN WORKS!');
  } else {
    console.log('\n  ❌ SIGN-IN FAILED - No session user');
  }
}

main().catch((e) => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
