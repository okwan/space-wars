# Asset Specs — level: the zone

> **Source**: design/game-brief.md (beacons, asteroid zone); design/art/art-bible.md §6
> **Art Bible**: design/art/art-bible.md
> **Generated**: 2026-11-16
> **Status**: 12 assets specced / 0 approved / 0 in production / 0 done

art-director and technical-artist skipped — Solo mode: specs derived in this session from the art bible; technical constraints not validated (no performance budget set in project.yaml).

## ASSET-011 — Beacon

| Field | Value |
|-------|-------|
| Category | Sprite (vector) + VFX |
| Dimensions | ring = capture radius (170 px world); core 30 px |
| Format | SVG master + code |
| Naming | obj_beacon_ring.svg, obj_beacon_core_cyan.svg, obj_beacon_core_amber.svg |

**Visual Description:** A segmented ring of 8 arcs that rotates slowly, around an inner core glyph. Neutral: hollow thin dashed steel ring. Contested: arcs alternate cyan and amber as progress fills. Held: filled ring in the holder's colour plus that team's glyph in the core. The only slow-pulsing, radially symmetric object in the game.

**Art Bible Anchors:**
- §3: radial symmetry = objective
- §4: beacon states never by colour alone
- §1 P3: slow pulse always means objective

**Generation Prompt:** radially symmetric objective beacon from above, segmented ring of eight arcs around a small angular core glyph, glowing cyan, black background, flat vector; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-012 — Beacon wash

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | radius about 1.3x ring; flat radial gradient |
| Format | sprite fx_wash_radial_256.png tinted |
| Naming | fx_beacon_wash |

**Visual Description:** A soft, wide radial wash of team colour on the void around a held or contested beacon, dim at the edge; split with an unsteady seam when contested. Never lit on rocks or stars.

**Art Bible Anchors:**
- §2: only coloured ground light in the game
- §9 ref 3: flat radial gradient, no flares

**Generation Prompt:** very soft flat radial gradient of cyan light fading to transparent, no rays, no flare, black background; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-013 — Fleet gate

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | bracket pair 300 px tall world |
| Format | code |
| Naming | obj_gate (code) |

**Visual Description:** Two angular bracket frames in the fleet's dim colour marking where its ships launch. Machined and straight-edged, never glowing at full strength.

**Art Bible Anchors:**
- §6: two kinds of built object
- §4: dim variant only

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-014 — Asteroid set

| Field | Value |
|-------|-------|
| Category | Environment (vector) |
| Dimensions | radius bands: small 45-70, medium 70-100, large 100-130 px |
| Format | code-generated polygons |
| Naming | env_asteroid_s/m/l (code) |

**Visual Description:** Irregular 7-12-vertex rock outlines with some long straight facets, near-black fill #0b0e18, cool grey line #5d6684 at 1.5 px, two or three crack lines. Never glow, pulse or take team colour.

**Art Bible Anchors:**
- §3: irregular = rock
- §6: asteroids
- §4: rock colours

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-015 — Mine

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | 22 px on screen |
| Format | SVG / code |
| Naming | obj_mine_star.svg |

**Visual Description:** A four-point caltrop star, team-tinted and dim while arming, then a fast white blink once live.

**Art Bible Anchors:**
- §3: mines = four-point caltrop, fast blink
- §1 P3: fast blink never reads as objective

**Generation Prompt:** four-point caltrop star icon from above, thin glowing outline, black background, flat vector; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-016 — Bolt shot

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 18 px streak |
| Format | code |
| Naming | fx_shot_bolt (code) |

**Visual Description:** Short capsule dash with a hot core and a short tail in team colour.

**Art Bible Anchors:**
- §3: Bolts = capsule dashes

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-017 — Ricochet shot

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 26 px streak |
| Format | code |
| Naming | fx_shot_rico (code) |

**Visual Description:** Angular chevron with a longer tail, white-hot core; flashes a spark on each bounce.

**Art Bible Anchors:**
- §3: Ricochet = chevrons

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-018 — Scatter pellets

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 3 x 12 px |
| Format | code |
| Naming | fx_shot_scatter (code) |

**Visual Description:** Three small rhombus pellets in a fan, team colour, short life.

**Art Bible Anchors:**
- §3: Scatter = rhombus pellets

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-019 — Impact sparks

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 3-6 sparks, under 0.5 s |
| Format | particle sprite fx_spark_soft_64.png |
| Naming | fx_spark_soft_64.png |

**Visual Description:** Short line sparks that fly out from a hit, white for the first frames then team colour, a tier dimmer than ships.

**Art Bible Anchors:**
- §9 ref 2: debris a tier lower, dies fast
- §8: one texture per effect

**Generation Prompt:** single soft glowing spark streak sprite, white core, transparent background, 64 px; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-020 — Round-won shockwave

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | expands to 600 px world over 1.2 s |
| Format | code ring |
| Naming | fx_round_shockwave (code) |

**Visual Description:** An expanding ring from each held beacon in the winning colour, the one moment of full bloom.

**Art Bible Anchors:**
- §2: Round won carrier

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-021 — Starfield

| Field | Value |
|-------|-------|
| Category | Environment |
| Dimensions | 3 parallax layers, 1600 px tile |
| Format | code points |
| Naming | bg_stars (code) |

**Visual Description:** Three layers of point stars and tiny crosses at different parallax speeds, cool white-blue, never brighter than the dimmest gameplay line.

**Art Bible Anchors:**
- §6: background
- §3: stars are points or tiny crosses

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-022 — Nebula washes

| Field | Value |
|-------|-------|
| Category | Environment |
| Dimensions | 1024x1024 tiles, 3 variants |
| Format | PNG sRGB, straight alpha |
| Naming | bg_nebula_violet_1024.png, bg_nebula_blue_1024.png, bg_nebula_indigo_1024.png |

**Visual Description:** Very faint, soft cool clouds in deep blue to violet, under 25% opacity in game, at most one per screen. No stars or bright spots baked in.

**Art Bible Anchors:**
- §6: at most one faint nebula wash per screen
- §4: void stays dominant

**Generation Prompt:** very faint soft deep blue and violet space nebula cloud, low contrast, dark, seamless tileable, no stars, no bright spots, 1024x1024; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

