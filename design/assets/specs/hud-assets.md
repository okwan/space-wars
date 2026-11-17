# Asset Specs — system: hud-and-menus

> **Source**: src/main.ts screens; design/art/art-bible.md §7
> **Art Bible**: design/art/art-bible.md
> **Generated**: 2026-11-16
> **Status**: 14 assets specced / 0 approved / 0 in production / 0 done

art-director and technical-artist skipped — Solo mode: specs derived in this session from the art bible; technical constraints not validated (no performance budget set in project.yaml).

## ASSET-023 — Score race bars

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 520x12 px per team |
| Format | code |
| Naming | ui_score_race (code) |

**Visual Description:** Two thin bars, cyan above amber (fixed order), filling toward the target, with team totals in bold tabular figures.

**Art Bible Anchors:**
- §7: layout top centre
- §4: fixed team positions as colour backup

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-024 — Beacon status pips

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 24 px glyphs |
| Format | SVG |
| Naming | ui_icon_beacon_neutral/cyan/amber.svg |

**Visual Description:** Three small glyphs under the score race, hollow when neutral, team glyph when held.

**Art Bible Anchors:**
- §4: beacon states never by colour alone

**Generation Prompt:** three small angular line glyph icons, 2 px stroke, 24 px grid, white on black; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-025 — Energy bar

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 360x14 px |
| Format | code |
| Naming | ui_energy_bar (code) |

**Visual Description:** Bottom-centre bar in your team colour with the value in bold; below 30% it switches to a hatched fill with a warning glyph and threshold tick (red only here).

**Art Bible Anchors:**
- §4: red only in energy meter; hatched backup
- §7: energy in the eye line

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-026 — Kill feed

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 290 px wide, 5 lines |
| Format | code text |
| Naming | ui_kill_feed (code) |

**Visual Description:** Top-right lines 'X downed Y' with each name in its fleet colour, fading after 5 s, on a chamfered panel.

**Art Bible Anchors:**
- §7: feedback, who hit who

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-027 — Minimap

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 170x170 px |
| Format | code |
| Naming | ui_minimap (code) |

**Visual Description:** Chamfered panel showing the whole zone: rocks as dim marks, beacons as rings in state colour, ships as team-shaped blips, you in white, a frame for the view.

**Art Bible Anchors:**
- §7: no meaning by colour alone, team-shaped blips

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-028 — Off-screen beacon arrows

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 16 px |
| Format | code |
| Naming | ui_arrow_beacon (code) |

**Visual Description:** Angular arrows at the screen edge pointing to each beacon, in its state colour.

**Art Bible Anchors:**
- §3: angular glyphs

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-029 — Enemy name tag

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 14 px text |
| Format | code text |
| Naming | ui_name_tag (code) |

**Visual Description:** Name and hull of the nearest enemy above it, the only world label.

**Art Bible Anchors:**
- §7: only world label

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-030 — Panels and focus brackets

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | chamfer 8 px, 1 px line |
| Format | SVG 9-slice + code |
| Naming | ui_panel_chamfer.svg, ui_focus_brackets.svg |

**Visual Description:** Rectangles with 45 degree cut corners, fill #070a14 at 85%, steel hairline; focus shown by corner brackets and brighter text.

**Art Bible Anchors:**
- §3: UI shape grammar
- §9 ref 4

**Generation Prompt:** chamfered rectangular UI panel frame, hairline steel border, 45 degree cut corners, dark fill, corner focus brackets, flat vector; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-031 — Loadout icons

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 24 px grid, 1x and 2x |
| Format | SVG |
| Naming | ui_icon_hull_dart/lancer/bulwark.svg, ui_icon_weapon_bolt/rico/scatter.svg, ui_icon_mine.svg |

**Visual Description:** Hull icons are the hull silhouettes; weapon icons are their shot shapes. Angular, 2 px stroke.

**Art Bible Anchors:**
- §7: hulls and weapons shown as their own silhouettes

**Generation Prompt:** set of six minimal angular line icons on a 24 px grid: three spaceship silhouettes from above and three projectile shapes, white on black; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-032 — Title screen

| Field | Value |
|-------|-------|
| Category | UI screen |
| Dimensions | 1280x720 logical |
| Format | code + wordmark SVG |
| Naming | ui_screen_title, ui_wordmark_beacon_wars.svg |

**Visual Description:** Wordmark centred over one slowly pulsing beacon, dim ships crossing, menu list with focus brackets.

**Art Bible Anchors:**
- §2: Title mood
- §7

**Generation Prompt:** wordmark 'BEACON WARS' in a clean geometric sans, thin glowing outline, black background; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

## ASSET-033 — Respawn / loadout screen

| Field | Value |
|-------|-------|
| Category | UI screen |
| Dimensions | 1280x720 |
| Format | code |
| Naming | ui_screen_loadout |

**Visual Description:** Dimmed live zone behind a quiet panel: Destroyed, by whom, countdown, three hull cards and three weapon cards, selected card bracketed.

**Art Bible Anchors:**
- §2: Destroyed mood
- §7

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-034 — Pause and scoreboard

| Field | Value |
|-------|-------|
| Category | UI screen |
| Dimensions | 860x480 panel |
| Format | code |
| Naming | ui_screen_scoreboard |

**Visual Description:** Steel instrument panel, two team columns, pilot / ship / K / D in tabular figures, team colour only in headers.

**Art Bible Anchors:**
- §2: Pause mood
- §4: team colour as data only

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-035 — Settings, help, online screens

| Field | Value |
|-------|-------|
| Category | UI screen |
| Dimensions | 1280x720 |
| Format | code |
| Naming | ui_screen_settings, ui_screen_help, ui_screen_online |

**Visual Description:** List screens in the same panel grammar; values right-aligned in bold.

**Art Bible Anchors:**
- §7

**Generation Prompt:** Not applicable: drawn in code from the outline rules above.

**Status:** Needed

## ASSET-036 — Steam store art set

| Field | Value |
|-------|-------|
| Category | Marketing |
| Dimensions | capsule, header, library hero and logo at Steam's current required sizes |
| Format | PNG |
| Naming | store_capsule_main.png, store_header.png, store_library_hero.png, store_logo.png |

**Visual Description:** A Lancer and a Bulwark in a close dogfight across a held beacon, cyan against amber, with the wordmark; the beacon wash lights the void between them.

**Art Bible Anchors:**
- §1: light is the language
- §2: Dogfight mood

**Generation Prompt:** key art: two neon vector starfighters dogfighting from above across a glowing ring-shaped beacon, cyan versus amber, deep black space, tight bloom, dramatic diagonal composition, space for a logo; style: flat neon vector line art, 2D top-down, crisp constant-width glowing outline on near-black fill, tight bloom halo, deep black space #03040b; negative: photorealism, 3D render, gradients on hulls, scanlines, CRT curvature, text, logos, watermark, green, rainbow palette, soft rounded shapes, emoji, plain circles

**Status:** Needed

