// ASCOM (Windows-only) stub client.
//
// ASCOM is a Windows COM/IPC abstraction; talking to it from Node
// requires either:
//   (a) `winax` / `node-activex` — pulls in node-gyp, breaks easily
//        across Node versions.
//   (b) Spawning a tiny C# / PowerShell helper exe that does the
//        COM calls and exposes them over a pipe / HTTP. This is
//        the path the real implementation will take — it isolates
//        the brittle native dependency.
//
// For now this is a deliberate stub that throws a clear error on
// non-Windows platforms or when ASCOM is requested. It exists so
// the dispatch logic in `server.js` can switch on protocol without
// platform-specific imports leaking into the main path.

import { EventEmitter } from 'node:events';

const IS_WINDOWS = process.platform === 'win32';

export class AscomClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.driverProgId = opts.driverProgId ?? 'ASCOM.Simulator.Telescope';
    this.lastRa = null;
    this.lastDec = null;
    this.gotInitialPointing = false;
  }

  async connect() {
    if (!IS_WINDOWS) {
      throw new Error(
        'ASCOM is a Windows COM technology; this helper currently only ' +
        'supports ASCOM on Windows. Use INDI on macOS / Linux instead.',
      );
    }
    // Real implementation roadmap:
    // 1. Spawn a bundled .NET 8 self-contained helper exe (50 MB) that
    //    instantiates the configured ASCOM Telescope driver.
    // 2. Talk to it over a Unix-domain-like Named Pipe (\\.\pipe\sss-ascom).
    // 3. Marshal Get-RightAscension / Get-Declination at 4 Hz, push them
    //    out as 'pointing' events.
    // 4. For SlewToCoordinates / AbortSlew / Park / Unpark, send command
    //    frames over the same pipe.
    // 5. On disconnect, gracefully kill the child process.
    throw new Error('ASCOM support is not yet implemented — coming in a follow-up release');
  }

  disconnect() { /* no-op until implemented */ }
  slew()        { throw new Error('ASCOM not implemented'); }
  sync()        { throw new Error('ASCOM not implemented'); }
  abort()       { throw new Error('ASCOM not implemented'); }
  park()        { throw new Error('ASCOM not implemented'); }
  unpark()      { throw new Error('ASCOM not implemented'); }
}
