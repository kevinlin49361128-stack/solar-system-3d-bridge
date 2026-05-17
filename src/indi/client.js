// INDI XML-over-TCP client — minimal subset needed for telescope
// pointing read + slew. INDI's full spec covers a zoo of property
// types, but for mount control we only need EQUATORIAL_EOD_COORD
// (read/write RA/Dec) + TELESCOPE_ABORT_MOTION (abort) + a small
// CONNECTION boilerplate.
//
// Wire format (RFC 1832-ish XML, no DTD, streaming):
//
//   <getProperties version="1.7" device="Telescope Simulator"/>
//   <defNumberVector device="Telescope Simulator" name="EQUATORIAL_EOD_COORD" ...>
//     <defNumber name="RA"  format="%010.6m">5.587</defNumber>
//     <defNumber name="DEC" format="%010.6m">-5.391</defNumber>
//   </defNumberVector>
//   <setNumberVector device="Telescope Simulator" name="EQUATORIAL_EOD_COORD" state="Ok">
//     <oneNumber name="RA">5.591</oneNumber>
//     <oneNumber name="DEC">-5.395</oneNumber>
//   </setNumberVector>
//
// We use a forgiving regex-based parser rather than pulling in a full
// XML library — INDI's tags arrive one-per-line in practice and the
// surface we touch is tiny.

import { createConnection } from 'node:net';
import { EventEmitter } from 'node:events';

const PROPERTY_RE = /<(def|set)(Number|Switch)Vector\s+([^>]*?)>([\s\S]*?)<\/\1\2Vector>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;
const ONE_NUMBER_RE = /<(?:def|one)Number[^>]*name="(\w+)"[^>]*>([^<]+)</g;

export class IndiClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.host = opts.host ?? '127.0.0.1';
    this.port = opts.port ?? 7624;
    this.device = opts.device ?? null;  // null = auto-discover first mount
    this.sock = null;
    this.buf = '';
    /** Last known RA (hours) / Dec (degrees) from EQUATORIAL_EOD_COORD. */
    this.lastRa = null;
    this.lastDec = null;
    /** Whether we've seen the property at least once — gates slew(). */
    this.gotInitialPointing = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const sock = createConnection({ host: this.host, port: this.port }, () => {
        this.sock = sock;
        sock.write('<getProperties version="1.7"/>\n');
        this.emit('connected');
        resolve();
      });
      sock.on('data', (chunk) => this._onData(chunk));
      sock.on('error', (err) => { this.emit('error', err); reject(err); });
      sock.on('close', () => { this.sock = null; this.emit('close'); });
    });
  }

  disconnect() {
    this.sock?.end();
    this.sock = null;
  }

  _onData(chunk) {
    // INDI is a streaming protocol — concatenate, run the property regex
    // against the accumulated buffer, slice out what we matched.
    this.buf += chunk.toString('utf8');
    let lastEnd = 0;
    let m;
    PROPERTY_RE.lastIndex = 0;
    while ((m = PROPERTY_RE.exec(this.buf)) !== null) {
      const attrs = parseAttrs(m[3]);
      const inner = m[4];
      if (attrs.name === 'EQUATORIAL_EOD_COORD') {
        if (!this.device) this.device = attrs.device;
        if (this.device === attrs.device) {
          const vals = parseOneNumbers(inner);
          if ('RA' in vals && 'DEC' in vals) {
            this.lastRa = Number(vals.RA);
            this.lastDec = Number(vals.DEC);
            this.gotInitialPointing = true;
            this.emit('pointing', { raHours: this.lastRa, decDeg: this.lastDec });
          }
        }
      }
      lastEnd = m.index + m[0].length;
    }
    // Drop the consumed prefix — keep any trailing partial element so
    // the next chunk can complete it.
    if (lastEnd > 0) this.buf = this.buf.slice(lastEnd);
    // Soft cap to avoid unbounded growth if the server stops sending
    // complete elements (shouldn't happen in practice, but defensive).
    if (this.buf.length > 1 << 20) this.buf = this.buf.slice(-(1 << 16));
  }

  /**
   * Issue a slew by writing the EQUATORIAL_EOD_COORD target. INDI mounts
   * interpret a writeable EQUATORIAL_EOD_COORD as "go here" when the
   * ON_COORD_SET property is in TRACK or SLEW state — most drivers default
   * to TRACK, which is what we want for visual / imaging use.
   */
  slew(raHours, decDeg) {
    if (!this.sock) throw new Error('not connected');
    if (!this.device) throw new Error('no device known yet — wait for first pointing');
    const xml = `<newNumberVector device="${escapeAttr(this.device)}" name="EQUATORIAL_EOD_COORD">
  <oneNumber name="RA">${raHours.toFixed(8)}</oneNumber>
  <oneNumber name="DEC">${decDeg.toFixed(6)}</oneNumber>
</newNumberVector>
`;
    this.sock.write(xml);
  }

  sync(raHours, decDeg) {
    if (!this.sock) throw new Error('not connected');
    if (!this.device) throw new Error('no device known yet');
    // ON_COORD_SET → SYNC, then write the coords, then back to TRACK so
    // subsequent writes resume slewing.
    this.sock.write(`<newSwitchVector device="${escapeAttr(this.device)}" name="ON_COORD_SET">
  <oneSwitch name="SYNC">On</oneSwitch>
</newSwitchVector>
`);
    this.slew(raHours, decDeg);
    this.sock.write(`<newSwitchVector device="${escapeAttr(this.device)}" name="ON_COORD_SET">
  <oneSwitch name="TRACK">On</oneSwitch>
</newSwitchVector>
`);
  }

  abort() {
    if (!this.sock || !this.device) return;
    this.sock.write(`<newSwitchVector device="${escapeAttr(this.device)}" name="TELESCOPE_ABORT_MOTION">
  <oneSwitch name="ABORT">On</oneSwitch>
</newSwitchVector>
`);
  }

  park() {
    if (!this.sock || !this.device) return;
    this.sock.write(`<newSwitchVector device="${escapeAttr(this.device)}" name="TELESCOPE_PARK">
  <oneSwitch name="PARK">On</oneSwitch>
</newSwitchVector>
`);
  }

  unpark() {
    if (!this.sock || !this.device) return;
    this.sock.write(`<newSwitchVector device="${escapeAttr(this.device)}" name="TELESCOPE_PARK">
  <oneSwitch name="UNPARK">On</oneSwitch>
</newSwitchVector>
`);
  }
}

function parseAttrs(s) {
  const out = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

function parseOneNumbers(inner) {
  const out = {};
  let m;
  ONE_NUMBER_RE.lastIndex = 0;
  while ((m = ONE_NUMBER_RE.exec(inner)) !== null) out[m[1]] = m[2].trim();
  return out;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
