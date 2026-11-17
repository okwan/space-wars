# Game Brief: Beacon Wars

## In your words
- "Beacon Wars: team fleets fighting over drifting beacons in a wrap-around asteroid arena, with swappable ship loadouts."
- Earlier: "repuprose this project. i want tgo build a modernized version of continuum its an old space game i playd and we can end up deploying it on steam" · "can it be A but a mix of C?" (big open zones, mixed with zones that fill with bots)
- 1. Teams: "teams."
- 2. Match or zone: "pretty sure it was open like a ton of people can be in one server at at a time?"
- 3. Flying: "the phsyics should feel ike the continuum gaem"

**Pitch:** Drop into a big, always-running asteroid zone where two fleets of pilots, real or bot, fight over drifting beacons, and every ship flies with heavy, slippery drift-and-thrust. *(inferred (strong))*

**Genre:** team zone-control space shooter: competitive multiplayer, with shooter combat *(inferred (strong))*

**Controls:** arrows or WASD to turn and thrust (S reverses), Space fires guns, Shift afterburns, E drops a mine; while respawning, 1-3 picks a hull and Z/X/C picks a weapon (Q/W/R clashed with W to thrust). *(guessed)*

**Question:** is drift-and-thrust dogfighting over moving beacons fun for ten minutes in a zone full of bots? *(guessed)*

**Hooks:** *(guessed)*
- The beacons drift, so the front line moves on its own and the fight keeps relocating.
- Energy is your shield and your ammo: every shot and every boost spends what keeps you alive.
- Swap your loadout every respawn to answer what the other fleet is flying.

**Intent:** needs N players: two fleets of 10, bots fill every seat but yours *(inferred (strong))*

## Look and references
- Look: glowing neon vector ships on deep black space; teams in cyan and amber; beacons as slow-pulsing rings that fill with the holder's colour; grey outlined asteroids; faint parallax starfield; every shot leaves a short glow trail. Every figure drawn, no emoji, no plain circles. *(provisional)*
- References: the old zone-based space shooters you played (the drift physics, energy as health, open zones) for feel only, nothing copied; Asteroids (wrap-around space, thrust). *(inferred (strong))*
- View: 2D · Camera: top-down, centred on your ship with slight look-ahead along your velocity; a minimap of the whole zone. *(guessed)*

## First minute
You spawn at your fleet's gate already flying; a hint says turn and thrust. You overshoot, learn to counter-thrust, and see the nearest beacon on the minimap drifting between asteroids. Two bots from each side are already circling it. You fire, watch your energy dip and refill, and get a kill by leading the shot. You sit inside the ring, it fills cyan, and your team's score starts ticking: the hook lands as the beacon drifts on and the enemy fleet turns to follow it. *(guessed)*

## Challenge
Bots fight properly from the start but miss sometimes and react a beat late. From about minute 2 the enemy fleet moves in groups to retake beacons. Dying costs a few seconds and gives the enemy a point; a bigger zone fight later means three beacons contested at once. *(provisional)*

## Core loop
- Pick a hull and weapon, launch from your gate.
- Fly to a beacon, fight for it, hold the ring until it turns your colour.
- Held beacons tick your fleet's score; the beacons drift, so the fight moves.
- Die, swap loadout, launch again. First fleet to the target score wins the round; the zone resets the beacons and keeps running.
- Leads: competitive play leads the teams, score, fair start and bots; the shooter leads flying, aiming and weapons.

## Goal & fail state
- Goal: your fleet reaches the target score first (beacon ticks plus kills); the zone then shows the winner and starts the next round without a menu. *(provisional)*
- Fail: the other fleet gets there first. Your ship's energy hitting zero destroys it: respawn after a short wait. *(provisional)*

## Features
- [x] Drift-and-thrust flight with real momentum, wrap-around zone edges and bouncing off asteroids
- [x] Energy as shield and ammo: guns, afterburn and mines all spend it
- [x] 3 drifting beacons you capture by holding the ring, ticking fleet score
- [x] Two fleets of 10: you plus 9 bots against 10 bots, bots that fly, lead shots, dodge and go for beacons
- [x] Loadout at respawn: 3 hulls (light, medium, heavy) and 3 weapons (rapid bolts, bouncing shot, spread)
- [x] Rounds that end on a score and restart in place; the zone never goes to a menu
- [x] Kill feed naming who hit who, score bar, minimap, energy bar

## Your systems
- teams · in the slice
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
**Kill condition:** if flying and fighting over beacons still isn't fun after two tuning rounds. *(guessed)*

**Who it's for / what they feel:** players who miss the old zone-based space shooters, and action fans who want an instant drop-in fight; the rush of out-flying someone in a close dogfight. *(guessed)*

**Games you love / don't:** Love Continuum (the game you played and want modernized). *(inferred (strong))*
