import assert from 'node:assert/strict';
import { liveHealth, localNetworkAddresses } from '../live/network.ts';

const addresses = localNetworkAddresses({
  lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true, cidr: '127.0.0.1/8' }],
  en0: [{ address: '192.168.1.42', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.1.42/24' }],
  bridge: [{ address: '10.0.0.5', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: false, cidr: '10.0.0.5/8' }],
  disconnected: [{ address: '169.254.21.8', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false, cidr: '169.254.21.8/16' }],
} as any);
assert.deepEqual(addresses, ['10.0.0.5', '192.168.1.42']);

const health = liveHealth(5173);
assert.equal(health.available, true);
assert.ok(Array.isArray(health.lanAddresses));
if (health.suggestedOrigin) assert.match(health.suggestedOrigin, /^http:\/\/[^/]+:5173$/);

assert.equal(liveHealth(5173, '127.0.0.1').localOnly, true);
assert.equal(liveHealth(5173, '127.0.0.1').suggestedOrigin, null);
assert.equal(liveHealth(5173, '::1').localOnly, true);
assert.equal(liveHealth(5173, '0.0.0.0').localOnly, false);
console.log('live network tests passed');
