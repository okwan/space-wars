# ADR-0001: The online zone: one authoritative server, bots in empty seats

## Status
Accepted (provisional: chosen overnight on Oscar's behalf, to revisit after he plays it)

## Date
2026-11-16

## Last Verified
2026-11-16

## Decision Makers
Claude, on Oscar's standing instruction to take recommended defaults overnight

## Summary
One Node server runs the whole zone with the same deterministic rules as the browser
(`src/game/`), takes each pilot's inputs over a WebSocket, and sends every pilot a snapshot 20
times a second. Every seat no person holds is flown by a bot; a joining pilot takes a bot's seat
on the fleet with fewer people, and the bot takes it back when the pilot leaves.

## Engine Compatibility
Web: Vite 8 builds the server bundle (`vite.server.config.ts`, SSR mode) for Node 22+. The
browser uses the built-in `WebSocket`; the server uses `ws` 8.22.0. No PixiJS on the server.

## ADR Dependencies
None.

## Context
### Problem Statement
The brief asks for "a big, always-running zone" that "a ton of people can be in at a time",
with bots filling empty seats and stepping out as players join, and drift-and-thrust physics
that must feel exact.

### Current State
The rules were already pure and deterministic (`src/game/`), driven by per-ship inputs.

### Constraints
- Original IP only; the netcode is ours.
- Cheating: a client must not decide hits or scores.
- One developer: the simplest thing that holds up.

### Requirements
- Drop in and out with no lobby.
- Your own ship responds with no felt delay.
- Runs headless and under test.

## Decision
- **Server-authoritative fixed step (60 Hz).** The server alone steps the zone, so hits, kills,
  captures and scores are decided in one place.
- **Inputs up, snapshots down.** A client sends its buttons every step, numbered (`seq`). The
  server sends a full snapshot every 3 steps with that client's last applied `seq` (`ack`).
- **Client prediction for your own ship only.** The client flies its own ship locally from its
  inputs and, on each snapshot, takes the server's copy and re-flies the inputs the server has
  not applied yet. Other ships coast on their velocity between snapshots, which for drift
  physics is nearly exact. Shots and mines appear when the server makes them.
- **Seats.** `takeSeat` and `leaveSeat` (`src/game/world.ts`) switch a ship between bot and
  human without moving it.
- **JSON** on the wire for now (`src/net/protocol.ts`, version `PROTOCOL`).

### Key Interfaces
`startZone(options) → Zone` (`server/zone.ts`), `NetSession` (`src/net/client.ts`),
`snapshot`/`applySnapshot`/`packInput` (`src/net/protocol.ts`).

### Implementation Guidelines
Any rule change goes in `src/game/` and so reaches both ends; nothing in `src/game/` may read the
DOM, Pixi, the clock or `Math.random`.

## Alternatives Considered
### Alternative 1: Peer-to-peer lockstep
Every client runs the full sim from shared inputs. Rejected: one slow peer stalls everyone, and
a zone people drop in and out of needs a host anyway.
### Alternative 2: Rollback (GGPO style)
Best feel for 2-8 players, but re-simulating 20+ ships with bots on every late input is costly,
and the zone is many-player. Kept as a later option for duels.
### Alternative 3: Steam networking (lobbies, P2P relay)
Ties play to Steam and to a host's machine. A dedicated server can still use Steam for
matchmaking and auth later.

## Consequences
### Positive
- Cheat-resistant scoring; one place to fix rules; the server is tested in CI (`tests/server/`).
### Negative
- Your shots appear one round trip late; snapshots are several KB each as JSON, sent 20 times a second to each pilot.
### Neutral
- Bots run only on the server when online.

## Risks
- Bandwidth at 40+ pilots: move to a binary format and delta snapshots (planned).
- Hosting cost: one small VM per zone; decide hosting before Early Access.

## GDD Requirements Addressed
design/game-brief.md: "an open zone many players share" (was a thin stand-in), "teams", "bots".

## Performance Implications
Server: one zone of 20 ships steps in well under 1 ms. Client: unchanged.

## Migration Plan
None: new. **Rollback plan**: the offline mode does not touch the network; remove the menu item.

## Validation Criteria
`tests/server/zone.test.ts` (seats, inputs, acks), `tests/unit/protocol.test.ts` (round trip),
and a live two-browser run (`production/qa/evidence/online-*.png`).
