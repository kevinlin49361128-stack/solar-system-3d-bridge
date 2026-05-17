# solar-system-3d-bridge

[![test](https://github.com/kevinlin49361128-stack/solar-system-3d-bridge/actions/workflows/test.yml/badge.svg)](https://github.com/kevinlin49361128-stack/solar-system-3d-bridge/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node: 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Local helper that lets the browser-based [solar-system-3d](https://github.com/kevinlin49361128-stack/solar-system-3d) simulator talk to a real telescope mount.

The browser can't open arbitrary TCP sockets or call Windows COM, so it can't speak INDI or ASCOM directly. This is the tiny translator process you run on the same machine as your mount control software. The browser opens a WebSocket to this helper, the helper translates between the simulator's JSON envelope and the mount's native protocol.

```
┌──────────────┐    WebSocket    ┌──────────────┐   INDI / ASCOM   ┌────────┐
│  3D sim tab  │ ──────────────  │  sss-bridge  │ ──────────────── │ mount  │
│  (browser)   │                 │   (Node)     │                  └────────┘
└──────────────┘                 └──────────────┘
```

## Status

**v0.1.0 — alpha.** INDI read + slew + sync + abort + park work against the INDI Telescope Simulator. ASCOM support is a stub on this release; that's the next thing on the roadmap.

## Quick start

```bash
npm install -g solar-system-3d-bridge
# 1. Start indiserver locally with a telescope driver, e.g.:
indiserver indi_simulator_telescope
# 2. Start the bridge:
sss-bridge
# 3. In the simulator: Realism panel → 🔭 INDI / ASCOM bridge → Connect
```

## Configuration

CLI flags (or matching `UPPER_CASE_ENV` vars):

| Flag | Default | What it does |
|------|---------|--------------|
| `--protocol=indi\|ascom` | `indi` | Which mount backend to talk to. |
| `--ws-port=N` | `7624` | WebSocket port for the browser. |
| `--ws-path=/path` | `/sim` | WebSocket path. |
| `--indi-host=HOST` | `127.0.0.1` | indiserver host. |
| `--indi-port=N` | `7624` | indiserver port. |
| `--indi-device=NAME` | (auto) | Restrict to a specific INDI device name. |
| `--driver=PROG_ID` | `ASCOM.Simulator.Telescope` | ASCOM driver ProgID (Windows only). |

## Platform support

| OS | INDI | ASCOM |
|----|------|-------|
| macOS / Linux | ✅ | ❌ (ASCOM is Windows-only by design) |
| Windows | ✅ (via WSL or native indiserver port) | ⚠️ stub — coming in v0.2 |

## Wire protocol

Documented in the parent repo: [docs/future-telescope-bridge.md](https://github.com/kevinlin49361128-stack/solar-system-3d/blob/main/docs/future-telescope-bridge.md).

In short, `{v: 1, type, ...}` JSON over WebSocket, with these message types:

- Browser → helper: `subscribe.pointing`, `slew`, `sync`, `abort`, `park`, `unpark`
- Helper → browser: `pointing`, `slew.start`, `slew.progress`, `slew.done`, `slew.aborted`, `error`

## Safety

This software can move heavy equipment. Read the safety section in the parent repo's bridge doc before enabling slew control. The browser side ships a layered safety gate; this helper is the second layer. Set physical limit switches on your mount as the final backstop.

## Development

```bash
git clone https://github.com/kevinlin49361128-stack/solar-system-3d-bridge.git
cd solar-system-3d-bridge
npm install
node src/cli.js
node --test test/        # run the parser tests
```

## License

MIT — see [LICENSE](./LICENSE).
