# How Beacon Wars beats the genre

*Research note, 2026-11-16. Inputs: the zubspace remake (code and docs read, not
played: zubspace.gg is blocked from the build container), the history of SubSpace
and Continuum, player comments on Continuum's 2015 Steam release, and the Beacon
Wars code on `claude/project-thread-v2vxxo` (PR #1). Recommendations, ranked; not a
survey.*

> **IP rule still holds.** Nothing here copies zubspace code (MIT, but we don't need
> it) or any SubSpace/Continuum asset, name, map, or number. zubspace ships the
> original game's art, sounds and maps, which it says it has no rights to
> (`ASSETS.md`); that is fine for a free fan project and impossible for a paid Steam
> game. That is also our opening: **zubspace can't be sold, we can.**

## 1. What we're up against

### zubspace in one paragraph

A faithful browser rebuild of SubSpace: Rust/WASM client, authoritative 60 Hz Rust
server over WebRTC, the original ships, art, maps and zone settings. Free-for-all
only (flags and soccer exist in code but are off), one zone per server process, 15
bots in three difficulty tiers, no accounts or persistence. It is excellent
engineering aimed at people who already love the game. Its design choices tell us
what the author thought was wrong with the original:

| zubspace choice | What it admits about the original |
|---|---|
| Every life spawns **fully upgraded** (`maxed_spawn_loadout`) | Grinding prizes back after each death is not fun for most players |
| Bots fill the zone, **one bot assigned per human**, easy/medium/hard mix | Empty zones kill the game; being mobbed by bots is no better |
| Idle spawners moved to spectator after 120 s | Idle players become free kills and clutter |
| "Fair warning before harm": you can't be hit by a ship or shot your client hasn't been shown yet | Dying to something you never saw feels like cheating |
| Server measures each link, warns, and benches bad connections | Laggers ruin fights for everyone |
| Near/mid/far visibility tiers with different update rates | Big zones need area-of-interest networking to scale |

What it does *not* try to fix: onboarding, the skill wall, social structure, goals
beyond kills, chat toxicity, discovery. That's the space we should own.

### Why Continuum shrank

From the history and from players on its Steam forum (2015-2017):

1. **Population collapse after a launch spike.** On Steam in 2015 it "got an initial
   population boost, and then within a month everything was deader than ever". By
   2017 players said "You have to bring friends in with you". One zone survived;
   the rest emptied.
2. **Fragmentation.** Dozens of zones and arenas split a small population until
   most showed zero players, which tells a newcomer the game is dead.
3. **The skill wall.** Drift physics plus veterans with 15 years of practice meant
   a new player's first hour was being killed by people they never saw. There was
   no tutorial, no matchmaking, and no protection.
4. **Nothing modernized.** No client update in a decade, no global stats, broken
   links, an obscure installer, keyboard-only controls.
5. **Cheating and toxicity.** Client hacks in the SubSpace era (Continuum's own
   reason to exist was a cheat-resistant client), and an open chat culture that
   newcomers often met first.
6. **No operator.** After Virgin dropped it, volunteers ran it: no marketing, no
   events, no roadmap.

### What it got right (keep all of it)

- **Drift-and-thrust with energy as both shield and ammo.** Every choice costs
  survival. This is the soul of the genre.
- **One big shared space you drop into**, no lobby, no match timer.
- **Bounty.** Kills make you visible and valuable, so the strong become targets.
- **Squads and leagues.** Clans, scheduled squad matches, and team zones were
  what kept people for years.
- **Low hardware bar, instant action, very high skill ceiling.**

### What modern games add

Rocket League (simple physics, huge skill ceiling, made fair by ranked matchmaking
and replays), .io games (play in one click), Brawlhalla and similar (free entry,
crossplay, bots in queues), and every recent indie multiplayer flop on Steam
teaching the same lesson: **the game must be fun with the players it actually has
on a Tuesday afternoon**, not the players it hoped for.

## 2. Recommendations, ranked

Ranked by how much each one decides whether the game lives. "Where" points at our
code (`claude/project-thread-v2vxxo`). Effort: S under a day, M a few days, L a
week or more.

### Tier 1: before any public playtest

**1. Density, not seats: the zone must always feel busy where you are.** *(M)*
Continuum died of empty rooms. Our ADR-0001 already puts bots in empty seats; make
the rule *density around humans*, not a fixed seat count. With a giant map, 40
ships spread over it is an empty game. Keep a target number of ships (say 6-10)
within a screen or two of every human, spawn bots near humans and retire distant
ones, and scale the active play area to the population (zubspace grows its spawn
square with player count; we can do the same with beacons waking near crowds).
One zone per region, never a server browser full of zeros.
*Where:* `server/zone.ts` (seat logic), `src/game/world.ts` (`takeSeat`/`leaveSeat`),
beacon placement in `src/game/sim.ts`, config `fleet_size`.

**2. Honest bots that protect new players.** *(S-M)*
Bots are our biggest advantage over the original. Use them on purpose:
- Tag them clearly (a small bot mark on the name). Players forgive bots; they don't
  forgive being fooled.
- Give each human at most one bot hunter at a time, and match that bot's tier to
  the human's recent results (we have `skill_easy`/`skill_hard`; drive them per
  target from a rolling K/D).
- New pilots' first few lives meet easy bots first, so their first kill comes in
  the first minute, as the brief's "first minute" promises.
*Where:* `src/game/bots.ts` (`think`, target choice), `bot_*` config.

**3. Make dying teach.** *(M)*
The skill wall is mostly invisible information. On death, show a two-second recap:
who killed you, with what, your energy when hit, and a short replay of the last
three seconds from above. Our simulation is deterministic and seeded, so a replay
is just the inputs, which makes this cheap for us and expensive for everyone else.
*Where:* `src/game/sim.ts` events, a ring buffer of inputs on the client, a death
panel in `src/main.ts`.

**4. Two control schemes, one physics.** *(M)*
Keep classic rotate-and-thrust. Add an "aim-steer" scheme for gamepad and Steam
Deck: point the stick and the ship turns toward it at the hull's normal turn rate
and thrusts. Same physics, same limits, far lower barrier. This is the single
biggest thing a modern player notices in the first ten seconds.
*Where:* input mapping only (`src/gamepad.ts`, `src/main.ts`); `src/game/` stays
untouched because it already takes left/right/thrust inputs.

**5. Prizes as risk, not baseline power.** *(S, design note for the concept thread)*
zubspace spawns everyone fully upgraded because re-grinding after each death was
miserable. If our prize pickups upgrade the ship, let them be temporary power
spikes that raise your bounty and show on the radar, so picking one up makes you
a target. Never let a veteran's baseline outclass a newcomer's. Every life starts
complete.

### Tier 2: before Early Access

**6. Fights with a beginning and an end inside an endless zone.** *(M)*
Endless FFA gives no reason to start or stop a session. We already have rounds to
500. Add zone events every 8-12 minutes (a beacon storm, a bounty hunt on the
leader, a convoy) announced a minute ahead, so people gather in one place and
leave on a high. Pair it with **scheduled prime-time events** posted on Steam: a
Continuum player in 2016 literally asked whether players "program like a day and
hour to play". Yes: concentrate the population on purpose.

**7. Squads as a first-class feature.** *(L)*
Squads kept Continuum alive for 25 years. Party up with Steam friends and land on
the same fleet, squad tags, a squad beacon-holding leaderboard, and a weekly squad
night. Joining a friend must be one click from the Steam friends list.

**8. Quiet by default.** *(S)*
Quick-chat pings (help, regroup, beacon under attack) and a ping wheel on the
gamepad cover most needs. Free text chat is team-only for new accounts and
one-click mutable; report and block from the scoreboard. Squads get their own
channel.

**9. Netcode that scales to a crowded zone.** *(L, ADR needed)*
Our JSON full snapshots at 20 Hz are right for now and wrong for 40+ ships:
- binary, delta-encoded snapshots per client against its last acknowledged frame;
- area-of-interest tiers (full rate near you, low rate further away, nothing past
  radar range);
- server-side hit checks against what the shooter saw (lag compensation), with a
  cap so high-ping players can't shoot around corners;
- benching links that stay bad, with a clear message;
- an unreliable transport on desktop (WebRTC data channels or Steam networking)
  so a lost packet doesn't stall the next one.
This is what zubspace spent most of its effort on, and why it feels good; we
should design ours from first principles in an ADR.
*Where:* `src/net/protocol.ts`, `server/zone.ts`, new ADR-0003.

**10. Free entry, paid nothing that matters.** *(decided 2026-11-16: Oscar chose free to play)*
A game that depends on population can't put a price wall in front of its players.
Chosen: **free to play on Steam plus a free browser build on the same
servers, with a one-time Supporter Pack** (hull skins, trails, squad banners) and
no stat advantages ever. The cost: free games attract smurfs and cheaters, which
our authoritative server already blunts and items 2 and 9 help with. The fallback
is a low price ($5-10) with regular free weekends; it keeps fewer players.

### Tier 3: after launch

**11. Persistent identity, no power creep.** Lifetime stats, per-hull mastery
badges, a seasonal leaderboard that resets, titles. Modern players expect the
global stats Continuum never had.

**12. Spectate and replay for streamers.** A free camera, follow-the-leader, and
shareable replay files (inputs plus seed, tiny). Good for clips, tournaments and
cheat review.

**13. Ranked team nights.** Once there's a population, a scheduled 5v5 beacon
league with ranked matchmaking gives the top 5% a reason to stay without letting
them farm the open zone.

**14. Steam Deck Verified.** Follows from item 4 and the Electron wrapper
(ADR-0002): readable text at 800p, full gamepad, no keyboard needed.

## 3. What not to do

- **Don't open many zones early.** One per region until each is full; empty
  lobbies are a death notice.
- **Don't let skill turn into stats.** No upgrades that persist between lives.
- **Don't hide bots or fake player counts.** Show "12 pilots, 18 bots".
- **Don't compete on nostalgia.** zubspace owns that, for free, with the real
  assets. Our pitch is for people who never played SubSpace: fun in 30 seconds,
  deep for 300 hours.

## 4. Suggested order

The build thread ("Pick the space game concept", which owns the game code) should
adopt items 1-5 in its current rework toward the giant map, prize pickups and
bounty, since the map size and prize rules decide items 1 and 5.

1. Items 1, 2 and 5 together (bots and density), then playtest.
2. Items 3 and 4 (dying teaches, aim-steer), then playtest with people new to the
   genre. Their 10-minute retention is the number to watch.
3. Item 9's ADR before any public server, then 6, 7, 8.
4. Item 10 is decided: free to play. Build the store page and the Supporter Pack around that.

## Sources

- zubspace source and docs, MIT, read 2026-11-16:
  <https://github.com/pkieltyka/zubspace> (`README.md`, `ASSETS.md`,
  `docs/gameplay.md`, `docs/authoritative_server.md`,
  `docs/connection-quality.md`, `docs/chaos_zone_settings.md`)
- Continuum Steam forum thread "Well, this was a failure", 2015-2017:
  <https://steamcommunity.com/app/352700/discussions/0/527273452883217554/?ctp=2>
- SubSpace history: <https://en.wikipedia.org/wiki/SubSpace_(video_game)> (as quoted in the zubspace README) and general knowledge of the game
- Further reading, not quoted: Dan Marshall on indie multiplayer (Gun Monkeys):
  <https://www.mcvuk.com/development/why-indies-probably-shouldnt-make-a-multiplayer-game>
- Our code: `claude/project-thread-v2vxxo` (PR #1), ADR-0001, `production/decision-log.md`
