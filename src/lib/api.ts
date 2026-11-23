/** Thin fetch wrapper that attaches the JWT from localStorage. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('nakoyonjo_token') : null;
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    const { useAuthStore } = await import('@/stores/auth-store');
    useAuthStore.getState().logout();
    // NOTE: no hard navigation here — this is a single-page app with no
    // /login route. logout() flips the auth state and AppShell renders the
    // login view automatically. A hard redirect to /login would 404.
    return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
  }
  return res;
}