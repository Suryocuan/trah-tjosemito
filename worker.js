// GET /api/people  -> publik, daftar seluruh anggota
// PUT /api/people  -> khusus pengurus (header x-admin-password)
//   body: { upsert: [person...], remove: [id...], replace: false }

const GENS = ['Leluhur utama', 'Anak', 'Putu / Wayah', 'Buyut', 'Canggah', 'Wareng', 'Udheg-udheg', 'Gantung Siwur'];
const FAMS = ['', 'A', 'B', 'C', 'D', 'E'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROOT = 'mbah-tjosemito';

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function getAdminPassword(env) {
  if (env.ADMIN_PASSWORD) return { pw: env.ADMIN_PASSWORD, source: 'secret' };
  try {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
    if (r && r.value) return { pw: String(r.value), source: 'database' };
  } catch (e) {}
  return { pw: '', source: 'none' };
}
async function isAdmin(request, env) {
  const { pw } = await getAdminPassword(env);
  if (!pw) return false;
  const [a, b] = await Promise.all([
    sha256(request.headers.get('x-admin-password') || ''),
    sha256(pw),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function clean(p) {
  if (!p || typeof p !== 'object') return null;
  const id = String(p.id || '');
  const name = String(p.name || '').trim();
  const gen = String(p.gen || '');
  const parentId = String(p.parentId || '');
  const spouseId = String(p.spouseId || '');
  const familyId = String(p.familyId || '');
  if (!ID_RE.test(id) || !name || name.length > 120) return null;
  if (!GENS.includes(gen) || !FAMS.includes(familyId)) return null;
  if ((parentId && !ID_RE.test(parentId)) || (spouseId && !ID_RE.test(spouseId))) return null;
  return { id, name, gen, parentId, spouseId, familyId, note: String(p.note || '').slice(0, 300) };
}

async function handleGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, gen, parent_id, spouse_id, note, family_id FROM people ORDER BY rowid'
  ).all();
  const people = results.map((r) => ({
    id: r.id, name: r.name, gen: r.gen,
    parentId: r.parent_id, spouseId: r.spouse_id, note: r.note, familyId: r.family_id,
  }));
  return json({ people });
}

async function handlePut({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: 'Tidak berwenang' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Format JSON tidak valid' }, 400); }

  const upsertRaw = Array.isArray(body.upsert) ? body.upsert : [];
  const remove = Array.isArray(body.remove) ? body.remove : [];
  if (upsertRaw.length > 2000 || remove.length > 2000) return json({ error: 'Data terlalu banyak' }, 400);

  const upsert = [];
  for (const raw of upsertRaw) {
    const c = clean(raw);
    if (!c) return json({ error: 'Data anggota tidak valid: ' + String(raw?.name || raw?.id || '?').slice(0, 60) }, 400);
    upsert.push(c);
  }
  for (const id of remove) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return json({ error: 'ID tidak valid' }, 400);
    if (id === ROOT) return json({ error: 'Leluhur utama tidak dapat dihapus' }, 400);
  }

  const db = env.DB;
  const stmts = [];
  if (body.replace === true) stmts.push(db.prepare('DELETE FROM people WHERE id != ?').bind(ROOT));
  for (const id of remove) {
    stmts.push(db.prepare('DELETE FROM people WHERE id = ?').bind(id));
    stmts.push(db.prepare("UPDATE people SET parent_id = '' WHERE parent_id = ?").bind(id));
    stmts.push(db.prepare("UPDATE people SET spouse_id = '' WHERE spouse_id = ?").bind(id));
  }
  for (const p of upsert) {
    stmts.push(
      db.prepare(
        `INSERT INTO people (id, name, gen, parent_id, spouse_id, note, family_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, gen = excluded.gen, parent_id = excluded.parent_id,
           spouse_id = excluded.spouse_id, note = excluded.note, family_id = excluded.family_id,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(p.id, p.name, p.gen, p.parentId, p.spouseId, p.note, p.familyId)
    );
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true });
}

async function handleLogin({ request, env }) {
  if (await isAdmin(request, env)) return json({ ok: true });
  await new Promise((r) => setTimeout(r, 500));
  return json({ error: 'Kata sandi salah' }, 401);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/people') {
      if (request.method === 'GET') return handleGet({ env });
      if (request.method === 'PUT') return handlePut({ request, env });
      return json({ error: 'Metode tidak didukung' }, 405);
    }
    if (url.pathname === '/api/login') {
      if (request.method === 'POST') return handleLogin({ request, env });
      return json({ error: 'Metode tidak didukung' }, 405);
    }
    if (url.pathname === '/api/status') {
      let dbOk = false;
      try { await env.DB.prepare('SELECT 1').first(); dbOk = true; } catch (e) {}
      const { source } = await getAdminPassword(env);
      return json({ passwordConfigured: source !== 'none', passwordSource: source, database: dbOk });
    }
    return env.ASSETS.fetch(request);
  },
};
