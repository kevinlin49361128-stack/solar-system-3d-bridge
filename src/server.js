// WebSocket server that bridges the browser simulator to a real
// INDI or ASCOM telescope. Speaks the {v:1, type, ...} JSON envelope
// documented in solar-system-3d's docs/future-telescope-bridge.md.
//
// Architecture:
//
//        ┌────────────┐  WS    ┌──────────┐  TCP/COM    ┌────────┐
//        │   browser  │ ────── │  server  │ ─────────── │ INDI / │
//        │  (3D sim)  │ <───── │   .js    │ <────────── │ ASCOM  │
//        └────────────┘        └──────────┘             └────────┘
//
// One mount, N browser clients. The first writer wins for slew /
// sync / park; subsequent writers get an error message + a banner
// in their UI (TODO: pass single-writer state to non-writer tabs).

import { WebSocketServer } from 'ws';
import { IndiClient } from './indi/client.js';
import { AscomClient } from './ascom/client.js';

const PUSH_HZ = 4;

export async function startServer(opts) {
  const protocol = opts.protocol ?? 'indi';
  const port = opts.port ?? 7624;
  const wsPath = opts.path ?? '/sim';

  const client = protocol === 'ascom'
    ? new AscomClient({ driverProgId: opts.driverProgId })
    : new IndiClient({ host: opts.indiHost, port: opts.indiPort, device: opts.device });

  await client.connect();
  console.log(`[bridge] connected to ${protocol.toUpperCase()} backend`);

  const wss = new WebSocketServer({ port, path: wsPath });
  console.log(`[bridge] WebSocket listening on ws://localhost:${port}${wsPath}`);

  const subscribers = new Set();
  let writerWs = null;  // single-writer token

  // Push pointing fixes from the backend to all subscribers. We attach
  // a timer rather than echoing every 'pointing' event so smart-scopes
  // that emit at >30 Hz don't saturate the WS — 4 Hz is more than
  // enough for the reticle.
  let lastPointing = null;
  client.on('pointing', (p) => { lastPointing = p; });
  setInterval(() => {
    if (!lastPointing) return;
    const payload = JSON.stringify({
      v: 1, type: 'pointing',
      ra: lastPointing.raHours, dec: lastPointing.decDeg,
      at: Date.now(),
    });
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }, 1000 / PUSH_HZ);

  // Propagate slew lifecycle. INDI doesn't natively emit a 'slew start /
  // done' — we infer from state transitions of EQUATORIAL_EOD_COORD.
  // (Left as TODO: hook IndiClient to emit these explicitly.)

  wss.on('connection', (ws, req) => {
    console.log(`[bridge] WS client connected from ${req.socket.remoteAddress}`);
    ws.on('message', (raw) => handleMessage(ws, raw));
    ws.on('close', () => {
      subscribers.delete(ws);
      if (writerWs === ws) writerWs = null;
    });
  });

  function handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    const claimWriter = () => {
      if (writerWs && writerWs !== ws && writerWs.readyState === writerWs.OPEN) {
        sendError(ws, 'NOT_WRITER', 'Another client is currently driving the mount.');
        return false;
      }
      writerWs = ws;
      return true;
    };

    switch (msg.type) {
      case 'subscribe.pointing':
        subscribers.add(ws);
        if (lastPointing) {
          ws.send(JSON.stringify({
            v: 1, type: 'pointing',
            ra: lastPointing.raHours, dec: lastPointing.decDeg, at: Date.now(),
          }));
        }
        return;
      case 'slew':
        if (!claimWriter()) return;
        if (typeof msg.ra !== 'number' || typeof msg.dec !== 'number') {
          return sendError(ws, 'BAD_COORDS', 'Slew requires numeric ra/dec.');
        }
        try {
          client.slew(msg.ra, msg.dec);
          broadcast({ v: 1, type: 'slew.start', ra: msg.ra, dec: msg.dec });
        } catch (e) {
          sendError(ws, 'SLEW_FAILED', String(e?.message ?? e));
        }
        return;
      case 'sync':
        if (!claimWriter()) return;
        if (typeof msg.ra !== 'number' || typeof msg.dec !== 'number') return;
        try { client.sync(msg.ra, msg.dec); }
        catch (e) { sendError(ws, 'SYNC_FAILED', String(e?.message ?? e)); }
        return;
      case 'abort':
        // Abort always allowed — overrides writer token.
        try { client.abort(); broadcast({ v: 1, type: 'slew.aborted' }); }
        catch (e) { sendError(ws, 'ABORT_FAILED', String(e?.message ?? e)); }
        return;
      case 'park':
        if (!claimWriter()) return;
        try { client.park(); }
        catch (e) { sendError(ws, 'PARK_FAILED', String(e?.message ?? e)); }
        return;
      case 'unpark':
        if (!claimWriter()) return;
        try { client.unpark(); }
        catch (e) { sendError(ws, 'UNPARK_FAILED', String(e?.message ?? e)); }
        return;
    }
  }

  function broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(s);
    }
  }

  function sendError(ws, code, message) {
    ws.send(JSON.stringify({ v: 1, type: 'error', code, message }));
  }

  return {
    close() {
      wss.close();
      client.disconnect();
    },
  };
}
