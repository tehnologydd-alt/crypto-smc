/** Public-key enrollment for a single personal APEX Android installation.
 * No shared deployment secret is transferred to a phone or distributed APK.
 * Enrollment is PENDING until the owner approves its fingerprint in Cloudflare D1.
 * Requests from approved devices require an RSA-PSS signature and unique nonce.
 */
const enc = new TextEncoder();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function decodeBase64(s) {
  if (typeof s !== 'string' || s.length > 1200 || !BASE64.test(s)) throw Error('bad base64');
  const raw = s.replace(/-/g, '+').replace(/_/g, '/');
  const data = atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '='));
  return Uint8Array.from(data, c => c.charCodeAt(0));
}
function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function encode64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-')
    .replace(/\//g, '_').replace(/=+$/g, '');
}
async function digest(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
async function boundedBody(request, cap = 25000) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  let size = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.byteLength; }
  return out;
}
export async function validatePublicKey(encoded) {
  if (typeof encoded !== 'string' || encoded.length < 350 || encoded.length > 800) return null;
  try {
    const raw = decodeBase64(encoded);
    const key = await crypto.subtle.importKey(
      'spki', raw, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']
    );
    if (key.algorithm.modulusLength !== 2048) return null;
    const fingerprint = hex(await digest(raw)).slice(0, 16).toUpperCase();
    return { key, fingerprint };
  } catch { return null; }
}
async function enroll(request, env) {
  if (!env?.DB) return json({ state: 'STORAGE_UNAVAILABLE' }, 503);
  let input;
  try {
    const bytes = await boundedBody(request, 1200);
    if (!bytes) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const checked = await validatePublicKey(input?.publicKey);
  if (!checked) return json({ error: 'INVALID_DEVICE_KEY' }, 422);
  const now = Math.floor(Date.now() / 1000);
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  try {
    const limit = await env.DB.prepare(
      "INSERT INTO ai_pair_guard(day_key,attempts) VALUES(?1,1) " +
      "ON CONFLICT(day_key) DO UPDATE SET attempts=ai_pair_guard.attempts+1 " +
      "WHERE ai_pair_guard.attempts<6 RETURNING attempts"
    ).bind(day).first();
    if (!limit) return json({ state: 'ENROLLMENT_DAILY_LIMIT' }, 429);
    const id = crypto.randomUUID();
    const verificationCode = hex(crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
    await env.DB.prepare(
      'INSERT INTO ai_devices(device_id,public_key,fingerprint,verification_code,approved,revoked,created_at) ' +
      'VALUES(?1,?2,?3,?4,0,0,?5)'
    ).bind(id, input.publicKey, checked.fingerprint, verificationCode, now).run();
    return json({ state: 'PENDING_APPROVAL', deviceId: id,
      fingerprint: checked.fingerprint, verificationCode });
  } catch { return json({ state: 'ENROLLMENT_UNAVAILABLE' }, 503); }
}
async function enrollmentStatus(request, env) {
  const id = new URL(request.url).searchParams.get('device');
  if (!DEVICE.test(id || '')) return json({ error: 'INVALID_DEVICE' }, 400);
  if (!env?.DB) return json({ state: 'STORAGE_UNAVAILABLE' }, 503);
  try {
    const row = await env.DB.prepare(
      'SELECT approved,revoked FROM ai_devices WHERE device_id=?1'
    ).bind(id).first();
    if (!row) return json({ state: 'NOT_FOUND' }, 404);
    return json({ state: row.revoked ? 'REVOKED' :
      row.approved ? 'APPROVED' : 'PENDING_APPROVAL' });
  } catch { return json({ state: 'STORAGE_UNAVAILABLE' }, 503); }
}
export async function deviceRoute(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === '/v1/device/enroll')
    return request.method === 'POST' ? enroll(request, env) : json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (pathname === '/v1/device/status')
    return request.method === 'GET' ? enrollmentStatus(request, env) : json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  return null;
}
export async function authorizedDevice(request, env, at = Date.now()) {
  const deviceId = request.headers.get('X-Apex-Device') || '';
  const nonce = request.headers.get('X-Apex-Nonce') || '';
  const timeRaw = request.headers.get('X-Apex-Time') || '';
  const signature = request.headers.get('X-Apex-Signature') || '';
  if (!env?.DB || !DEVICE.test(deviceId) ||
    !/^[A-Za-z0-9_-]{18,80}$/.test(nonce) ||
    !/^[0-9]{10}$/.test(timeRaw) || signature.length > 700) return false;
  const seconds = Number(timeRaw);
  if (Math.abs(Math.floor(at / 1000) - seconds) > 120) return false;
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT public_key,approved,revoked FROM ai_devices WHERE device_id=?1'
    ).bind(deviceId).first();
  } catch { return false; }
  if (!row || row.approved !== 1 || row.revoked !== 0) return false;
  try {
    const checked = await validatePublicKey(row.public_key);
    if (!checked) return false;
    const body = await boundedBody(request.clone());
    if (!body) return false;
    const path = new URL(request.url).pathname;
    const canonical = request.method + '\n' + path + '\n' +
      timeRaw + '\n' + nonce + '\n' + encode64(await digest(body));
    const ok = await crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: 32 }, checked.key,
      decodeBase64(signature), enc.encode(canonical)
    );
    if (!ok) return false;
    const consumed = await env.DB.prepare(
      'INSERT INTO ai_device_nonces(device_id,nonce,expires_at) VALUES(?1,?2,?3) ' +
      'ON CONFLICT DO NOTHING RETURNING nonce'
    ).bind(deviceId, nonce, seconds + 121).first();
    if (!consumed) return false;
    // Bounded cleanup, no secret material in logs.
    await env.DB.prepare('DELETE FROM ai_device_nonces WHERE expires_at<?1')
      .bind(Math.floor(at / 1000) - 300).run();
    return true;
  } catch { return false; }
}