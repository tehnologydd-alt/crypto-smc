import { createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const b64 = data => Buffer.from(data).toString('base64url');
const unb64 = data => Buffer.from(data, 'base64url');

export function loadVapidKeys(path) {
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const keys = {
    publicKey: b64(Buffer.concat([Buffer.from([4]), unb64(jwk.x), unb64(jwk.y)])),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
  writeFileSync(path, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

function expand(prk, info, length) {
  const chunks = []; let previous = Buffer.alloc(0), counter = 1;
  while (Buffer.concat(chunks).length < length) {
    previous = createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([counter++])])).digest();
    chunks.push(previous);
  }
  return Buffer.concat(chunks).subarray(0, length);
}

export function encryptPush(subscription, payload) {
  const clientPublic = unb64(subscription.keys.p256dh), auth = unb64(subscription.keys.auth);
  if (clientPublic.length !== 65 || auth.length !== 16) throw new Error('Invalid push subscription keys');
  const sender = createECDH('prime256v1'); sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const shared = sender.computeSecret(clientPublic);
  const prkKey = createHmac('sha256', auth).update(shared).digest();
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPublic, senderPublic]);
  const ikm = expand(prkKey, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  if (plaintext.length > 3990) throw new Error('Push payload too long');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4); recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublic.length]), senderPublic, encrypted]);
}

function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(u.hostname);
  } catch { return false; }
}

export async function sendPush(subscription, payload, vapid, subject) {
  if (!allowedEndpoint(subscription.endpoint)) throw new Error('Unrecognized push endpoint');
  if (!subject || !/^(mailto:|https:\/\/)/.test(subject)) throw new Error('Set VAPID_SUBJECT');
  const u = new URL(subscription.endpoint);
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = { aud: u.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(input), { key: createPrivateKey(vapid.privateKey), dsaEncoding: 'ieee-p1363' });
  const body = encryptPush(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: 'POST', body, signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `vapid t=${input}.${b64(signature)}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '60', Urgency: 'high'
    }
  });
  if (!response.ok) throw new Error(`Push HTTP ${response.status}`);
}

