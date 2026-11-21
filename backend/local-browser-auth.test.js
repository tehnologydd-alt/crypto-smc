import test from 'node:test';
import assert from 'node:assert/strict';
import { ownMachineRequest } from './local-browser-auth.js';

const interfaces = {
  WiFi: [{ address: '192.168.1.214' }],
  Loopback: [{ address: '127.0.0.1' }]
};

function request(peer, method = 'GET', origin) {
  return { method, socket: { remoteAddress: peer }, headers: {
    host: '192.168.1.214:3443', ...(origin ? { origin } : {})
  } };
}

test('PC browser can read and update its own LAN server', () => {
  assert.equal(ownMachineRequest(request('192.168.1.214'), { interfaces }), true);
  assert.equal(ownMachineRequest(request('::ffff:192.168.1.214', 'PUT', 'https://192.168.1.214:3443'), { interfaces }), true);
});

test('other LAN devices and foreign browser origins cannot use local access', () => {
  assert.equal(ownMachineRequest(request('192.168.1.114'), { interfaces }), false);
  assert.equal(ownMachineRequest(request('192.168.1.214', 'POST', 'https://example.com'), { interfaces }), false);
  assert.equal(ownMachineRequest(request('192.168.1.214', 'POST'), { interfaces }), false);
});

test('DNS rebinding host does not gain local access', () => {
  const req = request('192.168.1.214');
  req.headers.host = 'example.com:3443';
  assert.equal(ownMachineRequest(req, { interfaces }), false);
});
