<!-- PROTOTYPE - NOT FOR PRODUCTION -->
# Sprite-stack spike: Beacon Wars in 2.5D pixel art

**Status:** in progress (built 2026-11-19, waiting on Oscar's verdict)

## Hypothesis

Beacon Wars looks better, and still plays like a classic zone shooter, if the flat sprites are
replaced by **sprite stacking** (objects drawn as stacks of 2D pixel-art slices) in a **custom
software pixel renderer**, with a camera that glides between **top-down, isometric and
third-person** without a cut. No 3D engine, no WebGL: TypeScript writing pixels into a canvas.

## Run it

```bash
npm install
npm run proto:stack          # dev server, open the printed URL
npm run proto:stack:build    # one self-contained file: prototypes/sprite-stack-spike/dist/index.html
```

Controls are the game's: arrows or WASD fly, Shift burns, Space guns, F bomb, E mine.
**1 / 2 / 3** pick top-down / isometric / third-person (**C** cycles), drag to turn the top and
iso views, **mouse wheel** or **+ / -** zoom, **L** shows the slice viewer, **H** hides the HUD, **O** outlines,
**P** palette snapping, **G** dithering, **I** frame stats. URL flags: `?bot` (a bot flies your ship), `?view=iso`,
`?seed=7`, `?stack`, `?manual` (no clock; checks drive `window.proto`).

## What is in it

- **The real game underneath.** `src/game` (the free-for-all zone from PR #1: map, bots, guns,
  bombs, mines, salvage, bounty) runs unchanged, apart from one hit-test fix (see findings). Only the picture is new, which is the point:
  the rules stay pure and server-ready whatever the renderer is.
- **Software renderer** (`render/raster.ts`), 480 x 270 scaled up with nearest neighbour.
  Deferred: a G-buffer (albedo, sun term, depth, flags, object id), then a lighting pass.
  - Walls: the map's wall tiles become raised steel slabs over the void, greedy-meshed and
    binned in 32-tile chunks (`render/walls.ts`), rasterised as triangles with
    perspective-correct depth and near-plane clipping.
  - Sprite stacks: every surface voxel of every slice is projected and splatted as a
    depth-tested square, with a per-voxel normal and baked ambient occlusion. That is sprite
    stacking with a real camera, so the same art works from straight above, at an isometric
    tilt, from behind the ship and through every blend. Ships bank into turns (roll), which a
    classic flat stack cannot do. A half-size LOD takes over for far objects.
  - Lighting: a sun, coloured point lights from every bullet, bomb, engine, pod, mine and
    explosion (they light the walls and hulls), screen-space glow halos, distance fog.
  - Procedural space: two star planes (above and below, so every view has stars, with real
    parallax), a nebula floor far below, drifting nebula "clouds" between the deck and the deep,
    and 420 tumbling rocks at different depths. The safe zone is a see-through green deck grid
    with the station turning beneath it.
  - Retro finish: every pixel snapped to our own 64-colour palette through a 4x4 ordered dither,
    one-pixel ink outlines around sprite stacks, and a 3x5 pixel font of our own for the HUD.
- **Models drawn in code** (`render/models.ts`): Dart, Lancer and Bulwark in blue (you) and
  orange (them), salvage pod, mine, station, five rocks. All original; no assets are loaded.
- **Camera** (`main.ts`): yaw, pitch, distance, scale, lead and lift each glide towards the
  chosen view, so switching never cuts. The chase view follows the ship's heading and pulls in
  instead of going through walls.

## Findings so far

- **Should feel more zoomed out (Oscar, 2026-11-20):** the top-down view now shows about 1.8 times
  as far in each direction (scale 0.5 -> 0.28 world px per screen px at 480 x 270; iso 0.56 -> 0.33),
  and the top and iso views pull back up to a further 20% as you speed up, slowly, so it never
  pumps (`?nospeedzoom` turns that off). The mouse wheel (or + / -) zooms from very wide to close.
  Ships are drawn up to 30% larger when zoomed out so they stay readable (hitboxes unchanged), and
  the look-ahead reaches 150 px. Frames stay 21-28 ms headless.

- **Still feels like an arena, should feel like an open world (Oscar, 2026-11-20):** the prototype
  now plays on a new shared map style, `'open'` (`src/game/map.ts`, `openLayout`; the main game
  keeps `'arena'`, and `?arena` brings it back here). The zone is 1024 x 1024 tiles (16,384 px,
  four times the area) with long empty stretches between named places: a small hub (HAVEN), about
  a dozen asteroid fields, five derelict stations (steel rings with gaps, the old outposts), five
  coloured nebulae (looks only) and a rocky belt that thickens towards the rim, so the edge reads
  as a region, not a wall. Same seed, same map (`tests/unit/map.test.ts`, which also checks a
  route from the hub to the farthest derelict).
  - Entering a place shows its name ("ASTEROID FIELD / MOTH FIELD"), the HUD says where you are,
    and holding **Tab** opens a zone map with every region, ships and salvage.
  - More salvage and 18 pilots, with fewer bots kept near you, so players spread out.
  - Cost: load 1.2 s, frames 21-28 ms headless. Planets are culled per frame and per pixel.

- **The map feels like a box, not space; movement must be race-smooth (Oscar, 2026-11-20):**
  render-only, so collision and the map's layout are unchanged.
  - Walls are drawn as rocky floating islands instead of steel slabs (`render/walls.ts`): each
    tile's height grows with its distance from open space (8 to 40 px), so walls become stepped
    mounds. Stone tops in broad patches, wandering strata on the sides, rare glowing crystals.
  - The two-tile map border is not drawn. The edge of the zone is a soft violet energy field
    that brightens towards the boundary and fades with distance (`resolve`), so the zone opens
    onto space instead of ending at a wall.
  - Four far planets (real ray-traced spheres 2,200-3,100 px below the zone, with banded
    colours and a lit atmosphere rim) drift slowly under the play area: depth without extra
    parallax layers.
  - Racing: the top and iso cameras look ahead along your velocity (up to 110 px, smoothed),
    so you see more of where you are going at speed.
  - The rectangular layout was replaced by the open map in the next round (above).

- **Ships should tilt when turning; how does health come back? (Oscar, 2026-11-20):** ships now
  bank up to about 45 degrees on a soft spring that follows how fast they are really turning
  (measured per game step, so it never jitters) and settle with a slight overshoot when the turn
  ends. Energy (health and ammo) refills on its own whenever you are not on the afterburner; the
  bar now shows it: a light sweeps along it, its end glows, and it reads
  "RECHARGING +110/S", "FULL" or "AFTERBURNER DRAINING". A controls and tips card opens on the
  first launch (once per browser, T reopens it, `?tips` forces it) and the zone waits behind it.

- **Hard to kill anyone, awkward to aim (Oscar, 2026-11-20):** measured first. Bullets flew at
  470 px/s against ships doing up to 345, so they visibly drifted with your ship's speed and
  arrived late. A kill took about 13 hits. The hit check also only looked at where a bullet
  ended each step, so a fast bullet could skip through the edge of a ship. Changes:
  - `src/game/sim.ts` now tests a bullet's whole path each step (`sweptHit`, unit-tested), and
    the bullet hitbox margin is a config value (`gun_reach`, 2 as before). This is the one
    change to the shared rules, and it is a fix for the main game too.
  - Prototype-only tuning (`main.ts`; `?classic` restores the shared numbers): bullets at
    780 px/s with a shorter life (the same range), `gun_reach` 6, gun damage 220 (+80 a level),
    and about 28% faster turning.
  - An aim line: faint dots from the nose showing where a bullet fired now would go (they carry
    your ship's speed). It turns orange, and the target gets brackets, when that shot would meet
    an enemy that keeps its course. A hint only: nothing steers your shots.
  - Scripted, 9 minutes over 3 seeds, all bots: bullet hits per volley 46% -> 65%, kills per
    minute 3.2 -> 6.9, about 9 hits per kill (bomb hits included). A bot in your seat went from
    0 kills and 4 deaths to 3 kills and 1 death. A newcomer who just flies and shoots died 7
    times instead of 5, because time to kill is shorter for everyone.

- **HUD is hard to read, abilities are just text, kills don't feel rewarding (Oscar, 2026-11-20):**
  `ui.ts` draws a real HUD into the pixel layer.
  - An energy bar (energy is both health and ammo here) shows the part you just lost in a
    softer colour that drains away after a beat, and pulses red under 30%.
  - Ability slots (guns, bomb, mine, afterburner) have pixel icons and key labels. A dark shutter
    shows the cooldown, the slot greys out when you can't afford it or are in the safe zone, and
    pips show the gun and bomb level and the mines left.
  - Kills, score and bounty sit in badges at the top. Other ships show their name, bounty and an
    energy bar. Hits show markers and damage numbers. There is a kill feed and a toast for
    salvage.
  - The kill moment: a 75 ms freeze, a small camera zoom and a quick shake (kept small for eye
    strain), a gold shock ring and sparks, a "TARGET DOWN" banner with the bounty you won
    (DOUBLE! / TRIPLE! for quick kills, STREAK n for a run), a gold edge glow, and coins that
    burst from the wreck and pour into your score, each with a rising chime, over a fanfare.
    Sounds are synthesized (`sfx.ts`, M mutes).
  - The ability row and energy bar share one low row so the chase view keeps your ship visible.
  - Lesson for production: the reward is a sequence (freeze, flash, words, coins counting up,
    sound), not one effect, and every step is short.

- **Movement not smooth, blurry while flying, dizzy parallax (Oscar, 2026-11-20):** the picture
  was drawn only on 60 Hz sim steps, so frames between steps repeated or skipped. It was also
  stretched to the window by a non-integer factor, which smeared the pixels unevenly as the
  view moved. Fixed with render interpolation between sim steps (`snapshot`/`blendIn`/`blendOut`
  in `main.ts`). The canvas is now sized to the screen's real pixels (`setScale`, which includes
  `devicePixelRatio`), so the browser never resamples it. The top-down camera snaps to whole
  world pixels and then slides the finished frame by the sub-pixel remainder (`present`), so
  edges stay crisp but motion is continuous. Parallax is calmer: the drifting cloud layer is
  gone, stars and nebula sit much further away, and there are fewer, deeper rocks. Frame time
  at 1920 x 1080 (headless, no GPU): top 20.0 -> 16.9 ms, iso 18.7 -> 13.1 ms, chase 35.5 ->
  17.8 ms, mostly from removing per-pixel allocations and filtering lights per ship.

- **Ships too pixelated and hard to see, no thrusters, bots too strong (Oscar, 2026-11-19):**
  ships now draw in a detail layer at twice the world's resolution (`drawModelHi`,
  `composite` in `render/raster.ts`) from stacks upsampled with smoothing (`upsample` in
  `render/models.ts`), lit by the same sun and point lights, with a thin soft outline instead
  of a black one, and softer hull whites. Every nozzle now has a soft additive plume (steady,
  slow shimmer, longer on the afterburner) and a pilot light. Bots are gentler in this
  prototype only (`main.ts`: slower reactions, looser aim, fire only when lined up, shorter
  notice range, fewer bombs and mines, 12 pilots, 5 s spawn shield, 20-fight newcomer grace;
  `?hardbots` restores the shared config). In a scripted 9-minute run, a newcomer who just
  flies and shoots died 20 times with the old bots and 2 times with these.

- **Eye strain (Oscar's playtest, 2026-11-19):** the first build hurt to look at. The causes were
  high-frequency noise and flicker: a 4x4 ordered dither over everything (a screen-fixed pattern
  crawls when the camera moves), a busy purple nebula, dithered cloud and deck patterns,
  twinkling one-pixel stars, blinking wall lights, random engine flicker, bobbing and tumbling
  stacks, and per-voxel speckle on rocks. Fixed by: dither and palette snapping off by default
  (G and P turn them back on), smooth bilinear nebula and clouds kept dim, steady stars and
  lights, a plain deck tint, no bob or tumble, rocks in broad patches, and the top-down camera
  moving in whole screen pixels so edges step cleanly. Lesson for production: keep animation
  and texture low-frequency; the pixel look comes from the low resolution and outlines, not
  from noise.

- It works and reads well in all three views (`production/qa/evidence/sprite-stack/`).
- Cost in headless Chromium (software, no GPU): about 17 ms a frame top-down and iso, about
  25-30 ms in the chase view (more walls and lights in view). A real browser on a desktop is
  faster, but the chase view is near the budget; the next step would be a worker or WASM, or
  dropping the chase view to 384 x 216.
- Top-down stays the readable gameplay view: ships are about 20 px across, like the current
  build. Iso and chase are spectacle (spectating, replays, the title screen, a "cinematic"
  death cam) more than competitive views, because you see less of the zone around you.
- Bullets need to stay big and bright to read on the busy nebula; the art bible's "space is
  black" rule fights with the nebula, so a production version should keep it much darker.

## How it could go into the game

1. **Lowest risk:** keep Pixi for the game and render the sprite stacks into Pixi textures
   (each hull pre-rendered at 64 angles, or splatted to a canvas per frame). The top-down game
   gets the stacked look; nothing else changes.
2. **Full switch:** replace `src/render` with this renderer, keep `src/game` untouched, and move
   the HUD to the pixel buffer or a DOM overlay. The online client already gets plain world
   state, so it does not care which renderer draws it.
3. **Spectacle only:** keep the current renderer for play and use this one for the title
   screen, the death replay and spectating, where the iso and chase views shine.

If it moves to production it is rewritten to the project's standards, not copied.
