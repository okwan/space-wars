// PROTOTYPE - NOT FOR PRODUCTION
// Question: Is drift-and-thrust dogfighting over moving beacons fun for ten minutes in a zone full of bots?
// Date: 2026-11-16
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
// All numbers are this game's own starting values (genre feel, not copied from any game).
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },

  // ---- The zone ----
  world_size: { value: 4000, min: 2400, max: 8000, step: 200 },   // px per side, wraps at the edges
  asteroids: { value: 26, min: 0, max: 60, step: 2 },             // count (mirrored pairs)
  zoom: { value: 0.72, min: 0.4, max: 1.2, step: 0.02 },          // camera scale
  fleet_size: { value: 10, min: 2, max: 20, step: 1 },            // ships per fleet, you included
  respawn_time: { value: 4, min: 1, max: 10, step: 0.5 },          // s

  // ---- Flight (applies to every hull) ----
  drag: { value: 0.04, min: 0, max: 1, step: 0.01 },               // fraction of speed lost per s: tiny, so ships drift
  overspeed_bleed: { value: 2.5, min: 0.5, max: 10, step: 0.5 },   // how fast speed over the cap bleeds off, per s
  bounce: { value: 0.65, min: 0.1, max: 1, step: 0.05 },           // speed kept bouncing off an asteroid
  burn_thrust: { value: 1.8, min: 1, max: 3, step: 0.1 },          // afterburn thrust multiplier
  burn_speed: { value: 1.45, min: 1, max: 2.5, step: 0.05 },       // afterburn top speed multiplier
  burn_drain: { value: 340, min: 0, max: 1000, step: 10 },         // energy per s while afterburning

  // ---- Hulls: light Dart, medium Lancer, heavy Bulwark ----
  dart_energy: { value: 800, min: 200, max: 3000, step: 50 },
  dart_regen: { value: 210, min: 0, max: 600, step: 10 },          // energy per s
  dart_turn: { value: 4.3, min: 1, max: 8, step: 0.1 },            // rad per s
  dart_thrust: { value: 430, min: 100, max: 1200, step: 10 },      // px per s per s
  dart_speed: { value: 520, min: 150, max: 1200, step: 10 },       // px per s
  lancer_energy: { value: 1100, min: 200, max: 3000, step: 50 },
  lancer_regen: { value: 185, min: 0, max: 600, step: 10 },
  lancer_turn: { value: 3.5, min: 1, max: 8, step: 0.1 },
  lancer_thrust: { value: 340, min: 100, max: 1200, step: 10 },
  lancer_speed: { value: 440, min: 150, max: 1200, step: 10 },
  bulwark_energy: { value: 1650, min: 200, max: 3000, step: 50 },
  bulwark_regen: { value: 155, min: 0, max: 600, step: 10 },
  bulwark_turn: { value: 2.6, min: 1, max: 8, step: 0.1 },
  bulwark_thrust: { value: 255, min: 100, max: 1200, step: 10 },
  bulwark_speed: { value: 360, min: 150, max: 1200, step: 10 },

  // ---- Weapons: rapid Bolts, bouncing Ricochet, three-pellet Scatter ----
  bolt_interval: { value: 0.11, min: 0.03, max: 1, step: 0.01 },   // s between shots
  bolt_cost: { value: 34, min: 0, max: 300, step: 2 },             // energy per shot
  bolt_damage: { value: 85, min: 5, max: 800, step: 5 },
  bolt_speed: { value: 900, min: 200, max: 2000, step: 20 },       // px per s, added to ship velocity
  bolt_life: { value: 0.9, min: 0.2, max: 4, step: 0.1 },         // s
  rico_interval: { value: 0.36, min: 0.05, max: 2, step: 0.01 },
  rico_cost: { value: 90, min: 0, max: 400, step: 5 },
  rico_damage: { value: 250, min: 10, max: 1200, step: 10 },
  rico_speed: { value: 680, min: 200, max: 2000, step: 20 },
  rico_life: { value: 2.1, min: 0.3, max: 6, step: 0.1 },
  rico_bounces: { value: 3, min: 0, max: 8, step: 1 },
  scatter_interval: { value: 0.5, min: 0.1, max: 2, step: 0.02 },
  scatter_cost: { value: 120, min: 0, max: 500, step: 5 },
  scatter_damage: { value: 115, min: 10, max: 800, step: 5 },      // per pellet
  scatter_speed: { value: 780, min: 200, max: 2000, step: 20 },
  scatter_life: { value: 0.65, min: 0.2, max: 3, step: 0.05 },
  scatter_spread: { value: 0.17, min: 0.02, max: 0.6, step: 0.01 }, // rad between pellets
  mine_cost: { value: 260, min: 0, max: 800, step: 10 },
  mine_damage: { value: 620, min: 50, max: 2000, step: 10 },
  mine_radius: { value: 135, min: 40, max: 300, step: 5 },         // blast radius, px
  mine_trigger: { value: 70, min: 20, max: 200, step: 5 },         // an enemy this close sets it off
  mine_arm: { value: 1, min: 0, max: 4, step: 0.1 },               // s before it is live
  mine_life: { value: 25, min: 3, max: 90, step: 1 },              // s
  mine_cooldown: { value: 2, min: 0.2, max: 10, step: 0.1 },       // s
  mine_max: { value: 2, min: 1, max: 6, step: 1 },                 // live mines per ship

  // ---- Beacons and the round ----
  beacon_radius: { value: 170, min: 60, max: 400, step: 10 },      // capture ring, px
  beacon_drift: { value: 38, min: 0, max: 200, step: 2 },          // px per s
  capture_rate: { value: 0.22, min: 0.05, max: 1, step: 0.01 },    // ring per s per extra ship inside
  beacon_points: { value: 1, min: 0, max: 10, step: 0.5 },         // points per s per held beacon
  kill_points: { value: 3, min: 0, max: 30, step: 1 },
  target_score: { value: 500, min: 50, max: 2000, step: 10 },      // first fleet to this wins the round
  round_break: { value: 7, min: 2, max: 20, step: 1 },             // s the round's result shows before the next

  // ---- Bots: the challenge ----
  bot_reaction: { value: 0.28, min: 0.05, max: 1.5, step: 0.01 },  // s between bot decisions (human delay)
  bot_aim_error: { value: 0.13, min: 0, max: 0.6, step: 0.01 },    // rad of aim wobble at the start
  bot_aim_error_late: { value: 0.06, min: 0, max: 0.6, step: 0.01 }, // rad once the ramp is done
  bot_ramp_time: { value: 180, min: 10, max: 900, step: 10 },      // s for bot aim to sharpen
  bot_engage_range: { value: 680, min: 200, max: 1500, step: 20 }, // px
  bot_fire_angle: { value: 0.14, min: 0.02, max: 0.6, step: 0.01 }, // rad: fire only when lined up this close
  bot_retreat_energy: { value: 0.3, min: 0, max: 0.9, step: 0.05 }, // fraction: below it a bot stops firing and runs
  group_time: { value: 120, min: 0, max: 600, step: 10 },          // s into a round when the amber fleet starts moving in groups
  group_share: { value: 0.7, min: 0, max: 1, step: 0.05 },         // fraction of amber bots that join the group
};
