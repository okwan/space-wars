# Art Bible: Beacon Wars

> **Status**: Draft, revision 2 (sprite art). Revision 1 was picked on Oscar's behalf overnight; revision 2 follows his playtest note that the code-drawn look "looks really bad".
> **Owned By**: art-director
> **Last Updated**: 2026-11-16
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-11-16 — solo mode

`/art-bible` writes these nine sections in this order and replaces each
section's `[To be designed]` line as that section is approved. A section still
holding its placeholder is incomplete; a later run fills only those.

## Revision 2 (2026-11-16): painted sprites replace the neon vector look

Oscar played revision 1 and said the art still looks bad. The vector outlines are replaced with
painted 2D sprites from Kenney's CC0 packs (Space Shooter Redux and Extension, Explosion Pack,
Particle Pack, Planets, UI Pack Sci-fi). Where a rule below conflicts with this section, this
section wins; everything not listed here still stands.

- **Identity, updated.** Clean, bright, painted sci-fi sprites on a deep starfield with a cool
  nebula. Light still marks what matters (shots, flames, beacon rings and explosions sit on the lit
  layer and get bloom), but figures are now solid painted objects, not outlines.
- **Ships (§3, §5), our own art.** Drawn for this game in `tools/art/hulls.mjs`: white
  metal hulls with fleet paint (blue for cyan, orange for amber), dark ink outline, glass canopy,
  glowing nozzles. Class is the silhouette: Dart is a slim arrowhead with forward canards and one
  engine; Lancer a long lance nose, swept wings, wingtip pods and twin engines; Bulwark a broad
  armoured block with shoulder plates and three engines. Colour-blind backup kept: a small team pip behind each hull (cyan triangle, amber
  diamond), drawn over the sprite. Your ship keeps the white chevron.
- **Motion (§1.2).** Engine flames are sprites (blue or orange, white-hot on afterburner); drift
  trails and shot tails stay as short fading lines.
- **Shots and effects.** Laser sprites (amber versions hue-shifted from the blue originals), a
  glint on firing, impact stars on hits, a 9-frame painted explosion on kills and mines, a shield
  shimmer when hit. Sparks stay as streaks (a star-shaped spark read as a background star).
- **Salvage (§4), our own art.** A small white-gold cargo pod with a violet glowing core and a soft
  violet halo, turning slowly; it blinks for its last five seconds. Gold and violet belong to no fleet,
  so a pickup never reads as a friend or a foe. Gold also marks bounty in the HUD (bounty line,
  "Wanted" tag, minimap ring). Drawn in `tools/art/hulls.mjs`.
- **Beacons (§3, §6), our own art.** A station turns at the centre: a hexagonal core in a lit
  ring with four panel arms, painted blue when cyan holds it, orange when amber holds it, grey
  when neutral. The 8-arc ring, capture fill, team glyph
  and ground wash stay as drawn.
- **Rocks.** Grey meteor sprites, slightly darkened, sized to each rock's collision radius.
- **Background (§6).** A tiled starfield (darkened to the void colour), a tinted nebula at a
  second parallax depth, two dim far planets, plus the existing star dots.
- **HUD (§7).** Kenney's notched glass panels, tinted dark navy, frame every HUD group; gauges are
  the pack's glossy bars (blue for cyan, yellow for amber, red when low) on a dark track. Low-energy
  hatching, threshold tick and warning glyph are unchanged.
- **Asset standards (§8).** Sprites live in one atlas (`assets/sprites/atlas.png`, 1024 px,
  built by `tools/art/build-atlas.py` from the vendored originals in `assets/vendor/`). Every
  sprite faces up. Any new sprite needs a commercial-use licence recorded in
  `assets/provenance.yaml` and `THIRD_PARTY_NOTICES.md`. Bloom now runs on the lit layer only.
- **Known limits.** Shots, rocks, explosions, backgrounds and HUD panels are still stock Kenney
  art that other games use; the hulls and the station are ours. Next custom candidates: rocks,
  explosions and the HUD frame. Store and capsule art needs a human illustrator or a licensed image
  tool.

## 1. Visual Identity Statement

**Rule: Light is the language. If it matters, it glows; if it doesn't, it is dark.**
- Ships, shots, beacons and team colour carry all the light. Space, rocks and dressing stay dark and quiet.
- When unsure, give an element less light, not more, unless the player needs it to win the fight.

**Principles**
1. **Read the fight at a glance** (pitch: out-flying someone in a close dogfight)
   - Silhouette, team colour and heading read on a 20-ship screen at Steam Deck size in under a quarter second.
   - Test: when a ship, shot or effect competes for attention, choose the one that tells the player where an enemy is heading or what threatens them; cut decoration that hides it.
   - Hull shape tells class (Dart, Lancer, Bulwark); colour tells team only. Team colours are never reused for UI chrome, pickups or ambient glow.
2. **Weight is shown through motion, not mass** (pitch: heavy, slippery drift-and-thrust)
   - Make inertia visible: thrust flare, drift trails, slide cues that show where a ship is going before it gets there.
   - Test: when a choice is ambiguous, choose what shows velocity (trail, afterimage, exhaust length) over a static detail. A ship that looks still while drifting is wrong.
   - Trails and glow are short and fade fast: they show motion without hiding positions.
3. **A living zone, a moving front** (pitch: always-running zone, drifting beacons)
   - Layers, back to front: dark parallax depth, grey rock as terrain, beacons as the brightest slow objects, ships and shots on top.
   - Test: when the screen is cluttered, beacon state (neutral, contested, cyan, amber) wins over scenery. Asteroids and stars never glow or pulse.
   - Beacons are the only slow-pulsing element, so a slow pulse always means objective.

**Applies to all three**
- Every figure drawn: no emoji, no plain circles. Original IP only.
- Steam-store quality is a craft bar (line quality, bloom control, layered depth, animation), not a change of style.

*Alternative considered: "a cold tactical star-chart that burns where people fight" (muted instrument-panel map, only pilots, shots and beacons hot). Kept as the fallback if neon reads too generic in playtests.*

## 2. Mood & Atmosphere

Rule for every state: Section 4's colours never change by state. Only intensity, alpha, bloom and which elements are lit change. The world is dark in every state (Section 1); mood comes from how much light there is and where it sits.

**Light ladder, dimmest to brightest:** Pause < Destroyed < Lost < Title < Flying < Capturing < Dogfight < Won.

- **Title menu**: awe and invitation, "something is out there". Cool, low contrast, quiet void with slow parallax. Carrier: one beacon drifting behind the wordmark with a slow pulse; a few distant ships cross as dim silhouettes. Cyan and amber in equal measure. Energy: low.
- **Flying / exploring**: calm focus with a low hum of tension. Cool, high contrast, sparse: only your ship, your trail and the beacons are lit; rocks stay grey. Carrier: the drift trail, whose length shows speed; beacon pulses pull the eye across the zone. Energy: low to medium.
- **Dogfight**: adrenaline, controlled chaos, readable and never muddy. Peak local contrast; void and rocks darken slightly (soft vignette) so the fight lights itself; bloom rises but is capped. Shots have hot cores (pale tint of team colour) for a few frames. Carrier: shot streaks, ricochet sparks, shield flicker. Energy: high.
- **Holding / capturing a beacon**: tension turning into ownership. The beacon is the brightest slow object; a soft radial wash of team colour on the void around it is the only coloured ground light in the game, never cast on rocks or stars. Contested: the wash splits cyan and amber with an unsteady seam, ring arcs alternate colours. Held: steady wide wash, calm ring. Carrier: the wash and the ring-fill progress. Energy: medium, rising toward the flip.
- **Destroyed / loadout**: a sting, then a deliberate breath; "reset and try again", never shame. One bright flash (hot white core in team colour) and debris shards, then the live zone dims and desaturates behind a quiet panel. No red (red is for energy warnings). Carrier: the dimmed, still-moving zone and the hull preview lit in team colour. Energy: low.
- **Round won**: release and triumph. The only state with full bloom: your team colour floods outward from your beacons; enemy elements drop to dim variants. Carrier: an expanding shockwave ring from each held beacon. Energy: high, then settling.
- **Round lost**: deflation with resolve, "one more round". The mirror of Won: bloom to minimum, saturation drains, your team drops to dim variants, beacons settle into the enemy colour one at a time. The slowest motion of any state. Energy: low, heavy.
- **Pause / scoreboard**: cool analytical stillness. World frozen, darkened, desaturated, beacon pulse stopped (a still pulse reads as paused, since slow pulse means objective). Carrier: a steel-grey instrument panel with a chamfered frame; team colour only as team data. Energy: still.
- **Distinctness checks**: Won expands and brightens, Lost contracts and dims; Destroyed keeps the zone moving, Pause freezes it; Title is the only state with both colours balanced and nobody in control.

## 3. Shape Language

**Core grammar:** angular and faceted, straight edges and sharp points; nothing is soft. Light hugs edges, so everything that matters is a lit outline on a dark fill (Section 1).

**Symmetry rule** (shape alone tells category)
- Bilateral symmetry: a ship. Radial symmetry: an objective (beacons and capture rings only). Irregular: rock.

**Ship silhouettes** (shape tells class, colour tells team only)
- **Dart**: acute arrowhead, smallest, swept fins; widest at the rear, sharp point.
- **Lancer**: long needle, about 4:1 length to width; thin, with a small fin pair.
- **Bulwark**: wide hexagon, near 1:1, largest and blockiest; heavy flat prow with a notch.
- Test: solid-black silhouettes are told apart in any rotation at about 24 px on a Steam Deck screen.
- Heading cue on every hull: the nose is the brightest point (lit cockpit slit); the tail carries the thrust flare.
- Hull fill near-void dark; the edge line carries team colour.
- Team shape backup: a small pip on each hull, cyan a triangle, amber a diamond (marks team, not class).

**Shots and mines**
- Bolts: short capsule dashes. Ricochet: angular chevrons (signals the bounce). Scatter: three small rhombus pellets in a fan.
- Mines: four-point caltrop star, dim until armed, then a fast blink (fast, so it never reads as the slow objective pulse).
- No plain circles anywhere; stars are points or tiny crosses.

**Environment**
- Asteroids: angular chunks of 7-12 vertices, 1.5 px grey outline, no glow. Keep some long straight facets so ricochet angles read.
- Beacons: segmented ring of 8 arcs, an inner core glyph, slow rotation: the only radial shape in the zone.

**UI shape grammar**
- Panels: rectangles with 45 degree chamfered corners, 1-2 px lines. Focus and targeting: corner brackets.
- Icons: angular line glyphs, 2 px stroke on a 24 px grid. No pills or rounded buttons.
- Chrome never glows; only active, critical or team data glows.

**Hero vs supporting**
- Hero (most contrast, glow): beacons first, then ships. Supporting (short-lived): shots, mines, sparks. Ambient (dark, quiet): rocks, stars, dust.
- Clutter test: beacon state wins; decoration is cut before the fight is hidden.

## 4. Color System

**Primary palette** (7)

| Colour | Hex | Role |
|---|---|---|
| Void | #03040b | Background; everything unimportant rests here |
| Cyan | #2ef2ff (dim #0f5a66) | Team A only |
| Amber | #ffb030 (dim #6a4612) | Team B only |
| Neutral steel | #9aa4c4 | Unowned, neutral beacon, inactive |
| Rock | fill #0b0e18, line #5d6684 | Terrain, disabled UI lines; never glows |
| Alert red | #ff5a6a | Low energy and danger, HUD only |
| UI text | #d8deef primary, #aab4d4 secondary | All text and chrome content |

- Dim variants are decorative only (trail tails, ghosted team elements, lost-state fall-off): about 2.5:1 on void, so never information or text.
- Hot core: a pale tint of the team colour for muzzle flashes, impact cores and death flash, a few frames only (derived, not a primary).
- Contrast on void (estimates; verify with a tool): cyan ~15:1, amber ~11:1, red ~7:1, rock line ~3.6:1, UI text ~15:1 and ~10:1.

**Semantic vocabulary**
- Cyan or amber: which team owns or fired it. Nothing else.
- Neutral steel: unowned or inactive. Alternating cyan and amber arcs: contested beacon.
- Red: "act now", energy and danger only; never on ships, shots, beacons or rocks.
- Bright means matters, dark means doesn't. Brightness never encodes team.
- No green in the game (it would collide with red for red-green colour blindness); positive and confirm states use bright text plus an icon.
- A slow pulse always means objective.

**UI palette divergence**
- Chrome uses steel, rock line and text colours only; team colours never appear as chrome.
- Exception: team data (scoreboard headers, team scores, HUD beacon status, your own team marker).
- Panel fill #070a14 at about 85% alpha. Hover/focus: #aab4d4 to #d8deef with corner brackets. Disabled: #5d6684. Red only in the energy meter and warnings.

**Colourblind safety**
- **Cyan vs amber**: passes protan and deutan (blue-yellow axis); weaker under tritan; luminance is close (~1.3:1), so brightness cannot separate teams. Backups: team pip shape (triangle vs diamond), a distinct glyph in each held beacon's core, fixed HUD team positions (cyan left or top, amber right or bottom), per-team sound cues (audio direction to define).
- **Red vs amber**: under protan and deutan red looks like dark amber; red never appears on world objects, so it cannot be confused with the amber team. Low-energy backups: your hull line breaks into dashes and flickers (in team colour), the HUD bar switches to a hatched fill with a warning glyph and threshold tick, plus a sound cue.
- **Beacon states**: never colour alone. Neutral: hollow thin dashed ring. Contested: alternating arcs. Held: filled ring plus the team glyph in the core.
- **Verification**: protan, deutan and tritan simulations of a 20-ship Deck-size screenshot, kept in `production/qa/evidence/`.
- Optional high-contrast mode (thicker outlines, larger pips): recommended, scope to be decided.

## 5. Character Design Direction

**The pilots are the ships.** There are no people on screen; a ship's hull is its character. (Pitch: out-flying someone in a close dogfight.)

- **Player ship:** same hulls as everyone, told apart by a white chevron behind it and a one-pixel-wider core line. Never a different colour: your team colour is your team, not you.
- **Telling ships apart at a glance:**
  - Team by colour only: cyan or amber body line and engine flare.
  - Team backup: the hull pip (cyan triangle, amber diamond), Section 3.
  - Class by silhouette only (Section 3): Dart arrowhead, Lancer needle, Bulwark wide hexagon. Each must be named correctly from its outline alone at 24 px across, in grey.
  - Bots and people share hulls; a name tag marks the nearest enemy, and "BOT" is in the name, never in the art.
- **Pose and motion style:** rigid hulls, expressive motion. No banking sprites or squash; motion is told by engine flare length (idle, thrust, afterburn white-hot), a short drift trail along velocity, and a hit flash in the attacker's colour for 0.1 s.
- **Detail at camera distance:** ships are 24-50 px on screen at the default zoom. Detail budget: outline, one cockpit mark showing the nose, engine points. Panel lines or decals only if they survive at 24 px; otherwise cut.
- **Damage state:** energy below 30% breaks the hull line into flickering dashes (Section 4's low-energy backup), never cracks or smoke.
- **Test:** when a ship detail is ambiguous, keep it only if it tells team, class, heading or energy. Anything else is decoration and goes.

## 6. Environment Design Language

**The zone is terrain, not scenery.** No buildings or culture: the world is open space, rock and the beacons. (Pitch: big always-running asteroid zone; drifting beacons.)

- **"Architecture":** two kinds of built object only. Fleet gates (bracket frames in the fleet's dim colour where ships launch) and beacons (a segmented 8-arc ring around a core glyph, Section 3). Both are angular and machined, so they read as made against the round, rough rocks.
- **Texture philosophy:** flat stylised vector. Shapes are filled near-black with a single line; no painted or PBR textures on gameplay objects. Depth comes from parallax layers and soft background washes, never from texture on things you can hit.
- **Asteroids:** irregular 7-12-sided outlines with some long straight facets, near-black fill, cool grey line, a few crack lines. Never glow, never pulse, never use team colour. Sizes in three bands (small, medium, large) so collision size reads.
- **Prop density:** sparse. About 26 rocks in a 4000 px zone, mirrored for fairness; keep 300-420 px clear around gates and beacon start points. Open lanes matter more than dressing: a screen should never be more than about a third rock.
- **Background:** three star layers at different parallax speeds plus at most one faint nebula wash per screen, cool blue to violet, under 25% opacity. No stars brighter than the dimmest gameplay line.
- **Storytelling without text:** the beacon ring fills with the colour of whoever is taking it; held beacons tint their ring; wreck sparks show where a fight just happened and fade within a second; mines blink only once armed.
- **Test:** when a background element is ambiguous, make it darker and slower. If it can be mistaken for a ship, shot or beacon at a glance, it is wrong.

## 7. UI/HUD Visual Direction

### Art view
- **Screen-space HUD**, not diegetic, with one exception: your own low-energy state also shows on your hull (Section 4). The zone stays clean; the HUD lives at the edges.
- **Layout:** team scores and beacon status top centre (cyan bar above amber, fixed order); your fleet line top left; kill feed top right; energy bar bottom centre with hull and weapon beside it; minimap bottom right; first-minute hints just above the energy bar. Nothing in the middle third except banners that fade.
- **Typography:** one humanist sans with a tabular-figure option, two weights only (regular, bold). Sizes at 1280x720 logical: banners 28-48, menu items 22-24, HUD values 15-18, labels 14 minimum. Numbers always tabular so scores do not jitter.
- **Icons:** angular line glyphs, 2 px stroke on a 24 px grid (Section 3). Hulls and weapons shown as their own silhouettes and shot shapes, never a generic icon.
- **Panels:** chamfered rectangles, fill #070a14 at about 85%, 1 px steel line; focus by corner brackets and brighter text (Sections 3-4).
- **Motion:** UI animates fast and flat: 120-200 ms fades and slides, no bounce. Banners fade in over 0.15 s and out over 0.5 s. Bars ease toward their value over about 0.1 s so hits read as a drop, not a jump.

### UX view
- **Interaction fit:** the dogfight needs a read in under a second, so only energy, score race and beacon status may sit in the eye line; menus are list-based and work with keyboard only and gamepad only (already true in the build).
- **Readability:** in a dogfight the most important things are your energy and the nearest threat. Energy is bottom centre, close to your ship's screen position; the nearest-enemy name tag is the only world label. Kill-feed text must not cover the score race.
- **Accessibility floor:** 14 px minimum text at 720p logical (scales with the window); no meaning by colour alone (Section 4's backups apply to every HUD element, including the minimap: ships as team-shaped blips); all text at least 4.5:1 on its panel; controls remappable later (not built).
- **Feedback:** every hit names who landed it (kill feed in the hitter's colour), every death says by whom and with what, every capture says which beacon and who took it.
- **Conflict, flashing:** the art view wants a full-bloom flood on Round won and a bright white death flash; repeated flashes during a big fight can trouble photosensitive players. Trade-off: keeping them full strength gives the strongest moments; capping them protects some players.
  - **Picked (on Oscar's behalf, recommended):** keep the art direction as the default and add a "Reduce flashing" setting that caps flash brightness and bloom and removes screen shake. Revisit if he prefers it on by default.

## 8. Asset Standards

### Art view
- **Source of truth:** vector. Ship hulls, shots, mines, beacons, gates and icons are authored as outline point lists (code) or SVG, never painted bitmaps, so they scale to any resolution and recolour by team at runtime.
- **Raster assets** only for what vectors can't do well: nebula washes, glow sprites, particle sprites and the Steam store and capsule art. PNG (sRGB, straight alpha); store art per Steam's sizes.
- **Naming:** `[category]_[name]_[variant]_[size].[ext]`, lower case, e.g. `ship_lancer_outline.svg`, `fx_spark_soft_64.png`, `bg_nebula_violet_1024.png`, `ui_icon_mine_24.svg`.
- **Resolution tiers:** particle and glow sprites 32-128 px; backgrounds 1024 px tiles; UI icons 24 px grid exported at 1x and 2x.
- **Recolouring:** one white or grey master per sprite, tinted at runtime to cyan, amber or steel; never two coloured copies.
- **Provenance:** every file in `assets/` gets an entry in `assets/provenance.yaml` (source, author, licence, commercial use yes/no).

### Technical view
- **Engine:** PixiJS 8.22 on WebGL (Electron for Steam, ADR-0002 proposed). Target: 60 fps at 1280x800 on Steam Deck and 1080p on a mid laptop. No performance budget is set in `project.yaml` yet (no frame-time, draw-call or texture-memory numbers); set one before the art pass ships.
- **Vector cost:** redrawing every hull as `Graphics` paths each frame costs CPU per ship. Build each hull's shape once (a shared graphics context or baked texture per hull) and move and rotate it, instead of re-tracing outlines each frame.
- **Glow cost:** the current glow is a second, wider stroke per object (two passes per outline). A full-screen bloom filter at half resolution is one pass for everything.
- **Particles:** use a particle container with one sprite texture per effect; cap live sparks at about 600 on screen.
- **Texture memory:** with vectors plus a handful of sprites and backgrounds, expected under 32 MB; no budget set to check it against.
- **Unverified:** the cost of PixiJS 8 filters on the Deck's GPU in Electron has not been measured; measure before relying on bloom.

### Conflict: per-object glow or one bloom pass
- **Ideal (art):** every glowing outline gets its own soft halo tuned per object, as now.
- **Constrained (technical):** one half-resolution bloom pass over the lit layers; per-object halos only on beacons and your own ship.
- **Trade-off:** per-object glow gives exact control but doubles stroke work for 20 ships and hundreds of shots; one bloom pass is cheap and uniform but blooms everything bright, so Section 1's "less light unless it matters" must be held by brightness, not by halo.
- **Picked (on Oscar's behalf, recommended):** the constrained standard, with per-object halos kept for beacons and your own ship; measured on a Deck before it ships.

## 9. Reference Direction

Four references, each pointing a different way: line craft, fight readability and bloom, objective light, UI frame. Continuum and SubSpace are genre references only, never visual ones.

**1. Vector CRT displays (1980s vector arcade monitors) — line craft**
- Take: vertices and joins glow slightly hotter than the straight runs, so hull points and rock facets read sharp; fills are near-void, never shading; a very short afterimage on moving lines (supports drift trails).
- Avoid: scanlines, curvature, flicker, monochrome green or white, any retro monitor frame, wobbly lines. Ours are crisp with constant stroke width per class: modern, not nostalgia.

**2. Geometry Wars (Retro Evolved era) — many-object readability and bloom restraint**
- Take: a strict brightness tier (you and threats brightest and thickest; debris a tier lower, dying fast); bloom as a tight halo a few line widths wide, not a haze; types told apart by shape at equal line weight.
- Avoid: its warping grid, its rainbow enemy palette (ours is cyan, amber, steel), its particle volume (cap near 600, fade within a second), colour used to tell types apart.

**3. Navigation buoys and lighthouses at night — drifting objective light**
- Take: one slow rhythm (long pulse, long gap) that nothing else shares, so the pulse alone says objective; a wide, dim-edged coloured wash on the dark around the light and none on distant objects (the beacon wash, Section 2).
- Avoid: lens flares, light shafts, sweeping beams, starbursts, photographic realism. The wash is a flat radial gradient.

**4. The Designers Republic's interface work for Wipeout — chamfered instrument-panel HUD**
- Take: 45 degree cut corners on hairline panels, a small uniform type scale with tabular numbers, corner brackets for focus, mostly neutral panels so live data stands out.
- Avoid: ornamental micro-copy, fake barcodes, logos, glyph clusters, italic skew, mixed type styles, accent colour on chrome, dense layouts.

**Checks**
- Additive: 1 line behaviour, 2 brightness hierarchy and bloom size, 3 slow light and ground wash, 4 UI frame.
- Copy test: references live only on a mood board. Every shape, hull, glyph, layout and sound comes from Sections 3 and 7. If a screenshot could be mistaken for a reference at a glance, redraw it.
- Unverified: details of references 1, 2 and 4 come from general knowledge; check against screenshots before they become hard rules.

