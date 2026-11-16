# Game Brief: Beacon Wars

## In your words
- "Beacon Wars: team fleets fighting over drifting beacons in a wrap-around asteroid arena, with swappable ship loadouts."
- Earlier: "repuprose this project. i want tgo build a modernized version of continuum its an old space game i playd and we can end up deploying it on steam" · "can it be A but a mix of C?" (big open zones, mixed with zones that fill with bots)
- 1. Teams: "teams."
- 2. Match or zone: "pretty sure it was open like a ton of people can be in one server at at a time?"
- 3. Flying: "the phsyics should feel ike the continuum gaem"
- 2026-11-16: "giant map, pretty endless", pickups, bounty; then "nowhere close to what zubspace is like" / "evreything", and picked "Free-for-all, like the reference"

**Pitch:** Drop into one big walled zone where every pilot, real or bot, is against every other: slippery drift-and-thrust ships, fast bullets and splash bombs, salvage to grab and bounties to collect. *(Oscar's pick, 2026-11-16)*

**Genre:** free-for-all multiplayer space shooter in an open tile-wall zone *(Oscar's pick)*

**Controls:** arrows or WASD to turn and thrust (S reverses), Space fires guns, F or B fires a bomb, E lays a mine, Shift afterburns, Tab scoreboard, V full map, P pause, M mute; while relaunching, 1-3 picks a hull. Gamepad: stick steers, A thrusts, X guns, RB bomb, LB afterburn, B mine. *(guessed)*

**Question:** is drift-and-thrust dogfighting round walls, with bounties on everyone, fun for ten minutes in a zone full of bots? *(guessed)*

**Hooks:**
- Nothing slows you down: you fly by momentum and use walls to bounce, corner and escape.
- Energy is your shield and your ammo: every shot, bomb and boost spends what keeps you alive.
- Everyone carries a bounty; a loaded pilot is worth hunting, and losing means losing your upgrades.

**Intent:** needs N players: one zone of 16 seats by default (2-40), bots fill every seat no person holds *(inferred (strong))*

## Look and references
- Look: small sprite ships on black space with two layers of parallax stars; steel tile walls with a lit rim; a green-decked safe zone in the middle; bright pinpoint bullets coloured by level, glowing bomb orbs, splash rings. Our own art and Kenney CC0. *(provisional)*
- References: the classic online 2D space arenas (Continuum, SubSpace) and zubspace, an open-source tribute, studied for feel only. No code, art, sounds, maps, names or exact numbers copied. *(Oscar's pick)*
- View: 2D · Camera: top-down, locked on your ship, 1:1 scale; a local radar bottom right and a full-map overlay. *(Oscar's pick: like the reference)*

## First minute
You launch in the safe zone, where nothing can shoot or be shot. A hint says turn and thrust; you overshoot and learn to counter-thrust. You slip out through a gap in the safe zone's wall into the maze, bounce off a wall, and see orange dots on the radar. A salvage pod glows nearby: you grab it, your bounty ticks up, and a bot comes for you. You trade fire, lead a shot, and collect its bounty. *(guessed)*

## Challenge
Bots fight properly from the start but miss sometimes and react a beat late, and go easy on pilots with few fights. Most bots keep within a couple of screens of a real pilot, so the fight comes to you. They route round walls, run home to the safe zone when low and hunt fat bounties from further away. *(provisional)*

## Core loop
- Pick a hull, launch from the safe zone, fly out through its gates.
- Grab salvage pods: each gives one random upgrade for this life (cells, recharge, engine, turning, guns, bombs, bouncing bullets, multi-fire, mines) and raises your bounty.
- Fight anyone: guns for steady damage, bombs for splash, mines behind you. Kills raise your bounty.
- Whoever downs you collects your bounty as points; you lose every upgrade.
- Die, watch a 3-second replay, pick a hull, launch again.

## Goal & fail state
- Goal: climb the points table by collecting bounties. *(provisional)*
- Fail: your energy hits zero and you are destroyed; your upgrades and bounty go to whoever got you. *(provisional)*

## Features
- [x] A walled zone: 512 x 512 tiles of 16 px (8192 px), rooms with doorways, baffles and blocks, a ringed safe zone in the middle, generated from a seed (our own generator)
- [x] Flight with no drag, a speed cap, an afterburner, and bounces off walls that cost speed
- [x] Energy as shield and ammo; guns (levels 1-3, bullets carry your velocity), bombs (levels 1-3, splash), mines
- [x] Safe zone: no fire in or out, nobody inside can be hurt; a short spawn shield
- [x] Free-for-all: 16 pilots, bots in every free seat, routing round walls with A*
- [x] Salvage upgrades lost on death, bounty and points, the top bounty marked on the radar
- [x] Three hulls: Dart (fastest, one gun), Lancer (twin guns, bombs bounce once), Bulwark (tough, level 2 bombs)
- [x] HUD: energy top right, this life's upgrades, local radar with sector names, full map (V), free-for-all scoreboard (Tab), message feed bottom left
- [x] 3-second death replay; gamepad aim-steer; online zone server (ADR-0001)

Inspiration note: the walled zone, prizes and bounties are genre ideas. Every name, number, upgrade list, map, sprite and sound here is our own.

## Your systems
- teams · replaced by free-for-all (Oscar's pick, 2026-11-16)
- an open zone many players share · thin stand-in
- Continuum-like physics · in the slice
- swappable ship loadouts · in the slice *(guessed)*

## Keep
-

## Avoid
- Continuum's and SubSpace's names, ships, maps, art, sounds, UI, chat commands and exact tuning numbers: the feel only, in our own numbers.

## Out of scope
- A zone many players share online, with bots stepping out as players join: needs a server, not built yet; built instead: bot pilots in this browser, named as bots.
- Matchmaking, ranks and seasons: needs a server, not built yet
- Anti-cheat: needs a server, not built yet
- Replays and a kill cam: add it as a feature
- Hulls with their own special abilities, kept fair: grow it
- Aim help for gamepads: change it after play

## Build order
1. The slice: one ship flying with drift against bots in the zone, energy, guns, three beacons and the score. Goal: your fleet reaches the target first; lose: theirs does.
2. Loadouts at respawn, mines, kill feed and minimap.
3. Better bots: groups, retakes, retreating when low.
4. A server that runs the zone and swaps bots for joining players (an ADR first).

---
**Kill condition:** if flying and fighting round the walls still isn't fun after two tuning rounds. *(guessed)*

**Who it's for / what they feel:** players who miss the old zone-based space shooters, and action fans who want an instant drop-in fight; the rush of out-flying someone in a close dogfight. *(guessed)*

**Games you love / don't:** Love Continuum (the game you played and want modernized). *(inferred (strong))*
