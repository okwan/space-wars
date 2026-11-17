# Asset Specs — character: ships

> **Source**: design/game-brief.md (Features, hulls); design/art/art-bible.md §5
> **Art Bible**: design/art/art-bible.md
> **Generated**: 2026-11-16
> **Status**: 10 assets specced / 0 approved / 0 in production / 0 done

art-director and technical-artist skipped — Solo mode: specs derived in this session from the art bible; technical constraints not validated (no performance budget set in project.yaml).

## ASSET-001 — Dart hull

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | outline points, reads at 24 px; master 128x128 px export |
| Format | SVG master + code point list |
| Naming | ship_dart_outline.svg |

**Visual Description:** Acute arrowhead, the smallest hull: widest at the rear with two swept fins, a sharp nose with a lit cockpit slit, one engine point at the tail. Near-void fill, single team-tinted outline that runs slightly hotter at the vertices.

**Art Bible Anchors:**
- §3: bilateral symmetry = ship; Dart = acute arrowhead, widest at rear
- §4: outline tinted cyan or amber at runtime from one white master
- §5: detail budget = outline, cockpit mark, engine points

**Generation Prompt:** small arrowhead starfighter silhouette seen from directly above, swept rear fins, single engine, white outline only on black, centred, orthographic; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-002 — Lancer hull

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | outline points, about 4:1 length to width; master 128x128 px |
| Format | SVG master + code point list |
| Naming | ship_lancer_outline.svg |

**Visual Description:** Long needle hull about four times as long as wide, a short pair of side fins mid-body and twin engines at the tail. The nose is the brightest point. Medium mass: it must never be mistaken for the Dart at 24 px.

**Art Bible Anchors:**
- §3: Lancer = long needle, thin with a small fin pair
- §4: team tint from one master
- §5: told apart by outline alone in grey

**Generation Prompt:** long needle-shaped starfighter seen from directly above, 4:1 proportions, small side fins, twin engines, white outline on black, centred, orthographic; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-003 — Bulwark hull

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | outline points, near 1:1; master 160x160 px |
| Format | SVG master + code point list |
| Naming | ship_bulwark_outline.svg |

**Visual Description:** Wide hexagonal heavy hull, nearly as wide as long, with a flat notched prow and three engines across the tail. The blockiest silhouette in the game; lines are the same weight as the other hulls so size, not thickness, reads as heavy.

**Art Bible Anchors:**
- §3: Bulwark = wide hexagon, flat prow with a notch
- §3: equal line weight, shape tells class
- §4: team tint from one master

**Generation Prompt:** heavy hexagonal gunship silhouette seen from directly above, flat notched prow, three engines, white outline on black, centred, orthographic; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-004 — Team pips

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | 6-8 px on screen; master 32x32 |
| Format | SVG |
| Naming | ship_pip_cyan_triangle.svg, ship_pip_amber_diamond.svg |

**Visual Description:** A tiny filled marker on each hull's spine: a triangle for cyan, a diamond for amber. Team backup for colour-blind players; never changes with hull class.

**Art Bible Anchors:**
- §3: team shape backup
- §4: cyan vs amber colour-blind backup

**Generation Prompt:** tiny solid triangle and diamond icons, white on black, flat vector; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-005 — Your-ship chevron

| Field | Value |
|-------|-------|
| Category | Sprite (vector) |
| Dimensions | 12 px wide on screen |
| Format | SVG / code |
| Naming | ship_you_chevron.svg |

**Visual Description:** A thin white open chevron trailing behind the local player's hull, plus a core line one pixel wider than other ships. Never a different colour from the team.

**Art Bible Anchors:**
- §5: player told apart without a new colour

**Generation Prompt:** thin white open chevron mark, flat vector, black background; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-006 — Engine flare

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | length 0.9x hull radius idle thrust, 1.6x afterburn |
| Format | code-drawn triangle per engine point |
| Naming | fx_engine_flare (code) |

**Visual Description:** A narrow flickering triangle from each engine point: team colour while thrusting, white-hot core on afterburn, absent when coasting. Its length is the speed cue.

**Art Bible Anchors:**
- §1 P2: weight shown through motion
- §5: motion told by flare length

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-007 — Drift trail

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | about 0.35 s of positions, fades to dim variant |
| Format | code-drawn polyline |
| Naming | fx_trail (code) |

**Visual Description:** A short tapering line along the ship's actual velocity (not its facing), team colour fading to the dim variant. Shows a drifting ship is moving even with engines off.

**Art Bible Anchors:**
- §1 P2: a ship that looks still while drifting is wrong
- §4: dim variants are decorative only

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-008 — Hit flash

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 0.1 s |
| Format | code tint |
| Naming | fx_hit_flash (code) |

**Visual Description:** The struck hull's outline flashes in the attacker's colour for a tenth of a second, so every hit says who landed it.

**Art Bible Anchors:**
- §5: hit flash in attacker colour
- §7: feedback, who hit who

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-009 — Low-energy hull

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | below 30% energy |
| Format | code dash pattern |
| Naming | fx_low_energy (code) |

**Visual Description:** Below 30% energy the hull outline breaks into flickering dashes in team colour, never red, never smoke.

**Art Bible Anchors:**
- §4: red never on world objects; low-energy backup
- §5: damage state

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-010 — Death burst and debris

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 26 sparks + 4-6 hull shards, under 1 s |
| Format | particle sprite fx_spark_soft_64.png + code shards |
| Naming | fx_death_burst |

**Visual Description:** One bright flash with a hot white core in team colour, then the hull splits into 4-6 angular shards that spin out and fade, with sparks. Gone within a second.

**Art Bible Anchors:**
- §2: Destroyed = one bright flash and debris shards
- §8: sparks capped ~600 on screen

**Generation Prompt:** radial burst of short glowing line sparks and angular hull shards, white hot core, cyan tint, black background, flat vector, top-down; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

