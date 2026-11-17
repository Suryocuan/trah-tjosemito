// POST /api/login  -> memeriksa kata sandi pengurus (header x-admin-password)
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const [a, b] = await Promise.all([
    sha256(request.headers.get('x-admin-password') || ''),
    sha256(env.ADMIN_PASSWORD),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  if (await isAdmin(request, env)) return json({ ok: true });
  await new Promise((r) => setTimeout(r, 500)); // memperlambat tebak-tebakan sandi
  return json({ error: 'Kata sandi salah' }, 401);
}
