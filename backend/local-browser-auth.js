import { networkInterfaces } from 'node:os';

function address(value) {
  return String(value || '').replace(/^::ffff:/, '').replace(/%.+$/, '');
}

export function ownMachineRequest(req, { interfaces = networkInterfaces(), secure = true } = {}) {
  const ownAddresses = new Set(['127.0.0.1', '::1']);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) ownAddresses.add(address(entry.address));
  }
  const peer = address(req.socket?.remoteAddress);
  if (!ownAddresses.has(peer)) return false;

  // Reject DNS rebinding: a local socket alone does not make an arbitrary Host trusted.
  const host = req.headers.host || '';
  let origin;
  try { origin = new URL(`${secure ? 'https' : 'http'}://${host}`); }
  catch { return false; }
  if (!ownAddresses.has(address(origin.hostname)) && origin.hostname !== 'localhost') return false;

  // A foreign page must not be able to modify this server through the browser.
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin.origin) return false;
  return true;
}
