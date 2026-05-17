# Examples

This directory is reserved for example configurations and INDI driver wiring guides as they land. For now, the most useful example lives in the **simulator** repo, not here:

## No-hardware end-to-end test

The simulator ships a tiny mock helper (`examples/mock-bridge.mjs`, ~150 lines) that pretends to be a real INDI/ASCOM mount: it accepts `subscribe.pointing`, streams a sweep pattern by default, and faithfully simulates slew motion at ~3°/s in response to `slew` commands. Use it to:

- Develop the simulator-side UI without owning a mount
- Test slew → progress → done event handling
- Verify the abort / panic-stop path

See: <https://github.com/kevinlin49361128-stack/solar-system-3d/blob/main/examples/mock-bridge.mjs>

```bash
# In the simulator repo:
node examples/mock-bridge.mjs

# In the simulator UI: Realism panel → 🔭 INDI/ASCOM bridge → Connect.
# A green reticle sweeps the equator. Tick Tier 2 → click any DSO → 🔭→.
```

## Real INDI test (Linux / macOS)

Once you have an `indiserver` running locally with a telescope driver (`indi_simulator_telescope` is a good first target — no hardware needed):

```bash
# Terminal 1:
indiserver indi_simulator_telescope

# Terminal 2:
node src/cli.js                       # this repo, default INDI on :7624
```

The simulator-side mock-bridge and this real-INDI path produce the same wire messages for the browser — so anything that works against the mock should work against the real driver.

## ASCOM (Windows)

Not yet implemented — see `src/ascom/client.js` for the roadmap. PRs welcome.
