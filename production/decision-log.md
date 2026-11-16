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

Not done: hosting for public zones, accounts, Steam integration, music, binary wire format.
