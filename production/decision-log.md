# Decision log

Decisions made on Oscar's behalf on 2026-11-16, overnight, on his instruction to take the
recommended default for every open question. Each one is easy to change; say which.

| # | Decision | Why | Where to change it |
|---|---|---|---|
| 1 | Concept: Beacon Wars, zone control over drifting beacons, mixed with the always-running drop-in zone | Oscar picked Beacon Wars and asked to mix in the drop-in zone | `design/game-brief.md` |
| 2 | Two fleets of 10 (cyan and amber), bots in every empty seat | His answer "teams" plus "a ton of people in one server" | `fleet_size` in `data/config.json`; Settings |
| 3 | Drift-and-thrust flight: fixed turn rate, thrust, almost no drag, speed cap, afterburn; energy is shield and ammo | His answer "physics like the Continuum game", with our own numbers | `drag`, `*_thrust`, `*_speed`, `burn_*` in `data/config.json` |
| 4 | 3 hulls (Dart, Lancer, Bulwark) × 3 weapons (Bolts, Ricochet, Scatter), picked while respawning; mines on E | The brief's "swappable ship loadouts" | `data/config.json`, `src/render/art.ts` |
| 5 | Rounds: first fleet to 500 points (1 a second per held beacon, 3 a kill) wins; the next round starts in place after 7 s | A zone that never stops but still has wins | `target_score`, `beacon_points`, `kill_points`, `round_break` |
| 6 | Look: glowing neon vector ships on deep black space, cyan against amber | The usual pick; nothing in his words | `src/render/art.ts` |
| 7 | Controls: arrows/WASD, Space fire, Shift afterburn, E mine, Tab scoreboard, P pause; 1-3 and Z/X/C pick the loadout (not Q/W/R, which clashed with W) | Standard defaults | `src/main.ts` |
| 8 | Online: one authoritative Node server per zone, JSON over WebSocket, 20 snapshots a second, your own ship predicted | Simplest design that holds up and resists cheating | `docs/architecture/adr-0001-online-zone.md` |
| 9 | Steam wrapper: Electron recommended, not built | Same Chromium everywhere; needs his yes | `docs/architecture/adr-0002-steam-desktop-wrapper.md` (Proposed) |
| 10 | Bot difficulty Easy/Normal/Hard scales aim wobble and reaction time | Simple, readable | `skill_easy`, `skill_hard` |
| 11 | Name stays "Beacon Wars" as a working title | Concept name; he can rename | `index.html`, `README.md` |
| 12 | Art bible picks: solo mode (sign-off skipped), no green, team pips (cyan triangle, amber diamond) | Colour-blind backup without changing the palette | `design/art/art-bible.md` |
| 13 | One half-resolution bloom pass over the zone; own halos only on beacons and your ship | Art bible §8 constrained option; cheaper than a halo on every line | `src/main.ts`, `src/render/art.ts` |
| 14 | "Reduce flashing" setting, off by default: no white hit flash, no mine blink, no screen shake, half bloom | Art bible §7 conflict pick | `src/settings.ts` |
| 15 | Low energy below 30% (`low_energy_warn`): dashed flickering hull, hatched red bar, threshold tick, warning glyph and beep | Never colour alone (art bible §4) | `data/config.json` |
| 16 | Beacons: 8-arc ring, team glyph core, flat team wash; arcs alternate and the wash splits while a held beacon is drained | Art bible §2–§4 beacon states | `src/render/art.ts` |
| 17 | Round won: shockwave rings from the winner's beacons, bloom up 60% for the winner and down for the loser (capped under Reduce flashing) | Art bible §2 round states | `src/main.ts` |
| 18 | Shots get a pale hot core for their first 0.07 s; ships leave a short fading drift trail | Art bible §4, §5 | `src/render/art.ts` |
| 19 | Built the Electron wrapper as a removable `desktop/` folder (own package.json, Electron 45.2.1); ADR-0002 stays Proposed; no Steam account steps | Coordinator asked for it on recommended defaults; delete the folder to undo | `desktop/README.md` |
| 20 | Bloom is switched off when the browser has no WebGL (Canvas 2D fallback skips filters) | Otherwise colours doubled | `src/main.ts` |
| 21 | Audio: your engine hums (filtered noise, brighter on afterburner) and a low drone bed plays under the zone | Fills the silence between cues; all synthesized, no licensed audio | `src/audio.ts` |
| 22 | The regroup push now goes to whichever fleet is behind (amber on a tie), not always amber; wire protocol bumped to 2 | Bot-only play went from amber 11 of 18 rounds to 9 of 18; fair for online zones | `src/game/sim.ts`, `tests/unit/balance.test.ts` |
| 23 | Performance budgets set: 60 fps, 16.67 ms, 200 draw calls, 512 MB | Art bible §8 flagged none; CPU frame cost measured at ~5 ms | `project.yaml` |
| 24 | Hints show once per browser (remembered), plus a one-time low-energy hint | Returning players are not re-taught | `src/settings.ts` |

Not done: hosting for public zones, accounts, Steam integration, music, binary wire format.
