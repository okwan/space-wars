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
iso views, **+ / -** zoom, **L** shows the slice viewer, **H** hides the HUD, **O** outlines,
**P** palette snapping, **G** dithering, **I** frame stats. URL flags: `?bot` (a bot flies your ship), `?view=iso`,
`?seed=7`, `?stack`, `?manual` (no clock; checks drive `window.proto`).

## What is in it

- **The real game underneath.** `src/game` (the free-for-all zone from PR #1: map, bots, guns,
  bombs, mines, salvage, bounty) runs unchanged. Only the picture is new, which is the point:
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
