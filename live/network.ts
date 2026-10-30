import { networkInterfaces } from 'node:os';

/** IPv4 addresses that another device on the same network can try to reach. */
export function localNetworkAddresses(interfaces = networkInterfaces()): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

export function liveHealth(port: number | undefined, listenAddress?: string | null) {
  const safePort = Number.isInteger(port) && port! > 0 && port! <= 65535 ? port : 5173;
  const lanAddresses = localNetworkAddresses();
  const localOnly = !!listenAddress && (listenAddress === 'localhost' || listenAddress === '::1' || listenAddress.startsWith('127.') || listenAddress.startsWith('::ffff:127.'));
  return {
    available: true,
    lanAddresses,
    localOnly,
    suggestedOrigin: !localOnly && lanAddresses[0] ? `http://${lanAddresses[0]}:${safePort}` : null,
  };
}
