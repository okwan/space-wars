# Beacon Wars (working title)

A modern, original top-down multiplayer space-combat game for Steam, in the spirit of the classic 2D space arena
shooters. Built with TypeScript, Vite and PixiJS 8, and developed with a Claude Code game-studio workspace.

## The game

Two fleets of drift-and-thrust ships fight over three drifting beacons in a wrap-around asteroid zone. Hold a beacon
and your fleet scores; first fleet to the target wins the round, and the zone starts the next one in place. Energy is
your shield and your ammo. Every seat no person holds is flown by a bot, named as a bot, and a bot steps out when a
person joins. The design is the one-page brief, `design/game-brief.md`.

## Play and test

```bash
npm ci               # install the pinned versions
npm run dev          # play while working (Vite dev server); "Play the zone offline" needs nothing else
npm run server       # run an online zone on ws://localhost:8787; then "Join an online zone" in the menu
npm test             # Vitest (rules, wire format, server), then Playwright on the single-file build
npm run build        # production build in dist/
npm run build:single # one self-contained dist-single/index.html
```

| Folder | What is there |
|---|---|
| `src/game/` | The rules: pure, deterministic TypeScript (flight, weapons, beacons, rounds, bots, seats). Runs in the browser and on the server. |
| `src/net/`, `server/` | The online zone: wire format, browser client, Node server (`docs/architecture/adr-0001-online-zone.md`). |
| `src/main.ts`, `src/render/` | The client: scenes, HUD, camera and the neon vector art, drawn with PixiJS 8. |
| `data/config.json` | Every tuning value (speeds, energy, weapons, beacons, bots), each with its range. |
| `prototypes/beacon-wars/` | The first one-file prototype, kept as it was built. |

## The studio workspace

Built from [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (MIT, see
`THIRD_PARTY_NOTICES.md`) and configured for this game. It gives Claude Code 49 specialist agents (designers,
programmers, art, audio, QA, producer), 78 slash commands, hooks and doc templates. Open Claude Code in this folder (the
hooks and permissions load only when it starts here).

| Goal | Commands |
|---|---|
| Pin down the concept | `/brainstorm`, `/prototype`, `/art-bible`, `/map-systems` |
| Design a system (ships, weapons, arenas, netcode) | `/design-system`, `/quick-design`, `/design-review`, `/architecture-decision` |
| Plan the work | `/create-epics`, `/create-stories`, `/sprint-plan`, `/sprint-status` |
| Build and check | `/dev-story`, `/code-review`, `/smoke-check`, `/perf-profile` |
| Balance and feel | `/balance-check`, `/playtest-report`, `/team-combat`, `/team-polish` |
| Ship on Steam | `/cut`, `/launch-checklist`, `/release-checklist`, `/patch-notes` |

Not sure what to do next? `/next-step`. The full upstream guide is `docs/CLAUDE-CODE-GAME-STUDIOS.md`.
