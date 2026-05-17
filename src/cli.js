#!/usr/bin/env node
// sss-bridge — start the local INDI / ASCOM ↔ WebSocket bridge.
//
// Usage:
//   sss-bridge                                # default: INDI on 127.0.0.1:7624, WS on 7624
//   sss-bridge --protocol=ascom --driver=ASCOM.Simulator.Telescope
//   sss-bridge --indi-host=192.168.1.50 --indi-port=7624 --ws-port=8000
//
// Configurable env equivalents (lowercase, dashes → underscores):
//   PROTOCOL=indi|ascom
//   INDI_HOST, INDI_PORT, INDI_DEVICE
//   ASCOM_DRIVER
//   WS_PORT (default 7624), WS_PATH (default /sim)

import { startServer } from './server.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([\w-]+)(?:=(.+))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

const args = parseArgs(process.argv);
const env = process.env;

const config = {
  protocol:     args.protocol     ?? env.PROTOCOL     ?? 'indi',
  port:    Number(args['ws-port'] ?? env.WS_PORT      ?? 7624),
  path:         args['ws-path']   ?? env.WS_PATH      ?? '/sim',
  indiHost:     args['indi-host'] ?? env.INDI_HOST    ?? '127.0.0.1',
  indiPort: Number(args['indi-port'] ?? env.INDI_PORT ?? 7624),
  device:       args['indi-device'] ?? env.INDI_DEVICE ?? null,
  driverProgId: args.driver       ?? env.ASCOM_DRIVER ?? 'ASCOM.Simulator.Telescope',
};

console.log('[sss-bridge] starting with config:', config);

try {
  await startServer(config);
} catch (e) {
  console.error('[sss-bridge] failed to start:', e.message ?? e);
  process.exit(1);
}
