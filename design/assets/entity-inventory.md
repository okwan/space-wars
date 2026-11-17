# Visual Entity & Screen Inventory

> Generated: 2026-11-16
> Sources: design/game-brief.md, design/art/art-bible.md, src/main.ts, src/audio.ts

## Entities

| # | Name | Type | Description | Source | Status |
|---|------|------|-------------|--------|--------|
| 1 | Dart hull | Sprite (vector) | Acute arrowhead, the smallest hull: widest at the rear with two swept fins, a sharp nose with a lit cockpit slit, one engine point at the tail. | art-bible | Specced |
| 2 | Lancer hull | Sprite (vector) | Long needle hull about four times as long as wide, a short pair of side fins mid-body and twin engines at the tail. | art-bible | Specced |
| 3 | Bulwark hull | Sprite (vector) | Wide hexagonal heavy hull, nearly as wide as long, with a flat notched prow and three engines across the tail. | art-bible | Specced |
| 4 | Team pips | Sprite (vector) | A tiny filled marker on each hull's spine: a triangle for cyan, a diamond for amber. | art-bible | Specced |
| 5 | Your-ship chevron | Sprite (vector) | A thin white open chevron trailing behind the local player's hull, plus a core line one pixel wider than other ships. | art-bible | Specced |
| 6 | Engine flare | VFX | A narrow flickering triangle from each engine point: team colour while thrusting, white-hot core on afterburn, absent when coasting. | art-bible | Specced |
| 7 | Drift trail | VFX | A short tapering line along the ship's actual velocity (not its facing), team colour fading to the dim variant. | art-bible | Specced |
| 8 | Hit flash | VFX | The struck hull's outline flashes in the attacker's colour for a tenth of a second, so every hit says who landed it. | art-bible | Specced |
| 9 | Low-energy hull | VFX | Below 30% energy the hull outline breaks into flickering dashes in team colour, never red, never smoke. | art-bible | Specced |
| 10 | Death burst and debris | VFX | One bright flash with a hot white core in team colour, then the hull splits into 4-6 angular shards that spin out and fade, with sparks. | art-bible | Specced |
| 11 | Beacon | Sprite (vector) + VFX | A segmented ring of 8 arcs that rotates slowly, around an inner core glyph. | art-bible | Specced |
| 12 | Beacon wash | VFX | A soft, wide radial wash of team colour on the void around a held or contested beacon, dim at the edge; split with an unsteady seam when contested. | art-bible | Specced |
| 13 | Fleet gate | Sprite (vector) | Two angular bracket frames in the fleet's dim colour marking where its ships launch. | art-bible | Specced |
| 14 | Asteroid set | Environment (vector) | Irregular 7-12-vertex rock outlines with some long straight facets, near-black fill #0b0e18, cool grey line #5d6684 at 1. | art-bible | Specced |
| 15 | Mine | Sprite (vector) | A four-point caltrop star, team-tinted and dim while arming, then a fast white blink once live. | art-bible | Specced |
| 16 | Bolt shot | VFX | Short capsule dash with a hot core and a short tail in team colour. | art-bible | Specced |
| 17 | Ricochet shot | VFX | Angular chevron with a longer tail, white-hot core; flashes a spark on each bounce. | art-bible | Specced |
| 18 | Scatter pellets | VFX | Three small rhombus pellets in a fan, team colour, short life. | art-bible | Specced |
| 19 | Impact sparks | VFX | Short line sparks that fly out from a hit, white for the first frames then team colour, a tier dimmer than ships. | art-bible | Specced |
| 20 | Round-won shockwave | VFX | An expanding ring from each held beacon in the winning colour, the one moment of full bloom. | art-bible | Specced |
| 21 | Starfield | Environment | Three layers of point stars and tiny crosses at different parallax speeds, cool white-blue, never brighter than the dimmest gameplay line. | art-bible | Specced |
| 22 | Nebula washes | Environment | Very faint, soft cool clouds in deep blue to violet, under 25% opacity in game, at most one per screen. | art-bible | Specced |

## UI Screens

| # | Screen Name | Description | Source | Status |
|---|-------------|-------------|--------|--------|
| 1 | Title screen | Wordmark centred over one slowly pulsing beacon, dim ships crossing, menu list with focus brackets. | src/main.ts | Specced |
| 2 | Respawn / loadout screen | Dimmed live zone behind a quiet panel: Destroyed, by whom, countdown, three hull cards and three weapon cards, selected card bracketed. | src/main.ts | Specced |
| 3 | Pause and scoreboard | Steel instrument panel, two team columns, pilot / ship / K / D in tabular figures, team colour only in headers. | src/main.ts | Specced |
| 4 | Settings, help, online screens | List screens in the same panel grammar; values right-aligned in bold. | src/main.ts | Specced |

## HUD Elements

| # | Element | Description | Source | Status |
|---|---------|-------------|--------|--------|
| 1 | Score race bars | Two thin bars, cyan above amber (fixed order), filling toward the target, with team totals in bold tabular figures. | src/main.ts | Specced |
| 2 | Beacon status pips | Three small glyphs under the score race, hollow when neutral, team glyph when held. | src/main.ts | Specced |
| 3 | Energy bar | Bottom-centre bar in your team colour with the value in bold; below 30% it switches to a hatched fill with a warning glyph and threshold tick (red only here). | src/main.ts | Specced |
| 4 | Kill feed | Top-right lines 'X downed Y' with each name in its fleet colour, fading after 5 s, on a chamfered panel. | src/main.ts | Specced |
| 5 | Minimap | Chamfered panel showing the whole zone: rocks as dim marks, beacons as rings in state colour, ships as team-shaped blips, you in white, a frame for the view. | src/main.ts | Specced |
| 6 | Off-screen beacon arrows | Angular arrows at the screen edge pointing to each beacon, in its state colour. | src/main.ts | Specced |
| 7 | Enemy name tag | Name and hull of the nearest enemy above it, the only world label. | src/main.ts | Specced |
| 8 | Panels and focus brackets | Rectangles with 45 degree cut corners, fill #070a14 at 85%, steel hairline; focus shown by corner brackets and brighter text. | src/main.ts | Specced |
| 9 | Loadout icons | Hull icons are the hull silhouettes; weapon icons are their shot shapes. | src/main.ts | Specced |

## Audio

| # | Name | Type (SFX / Music / Ambient) | Description | Source | Status |
|---|------|------------------------------|-------------|--------|--------|
| 1 | Weapon fire set | SFX | Bolts a short bright tick; Ricochet a heavier saw with a downward slide; Scatter a short three-part burst. | src/audio.ts | Specced |
| 2 | Hit and kill | SFX | Hit: a dull low thump. | src/audio.ts | Specced |
| 3 | Explosion | SFX | Low saw and triangle with a falling pitch, half a second. | src/audio.ts | Specced |
| 4 | Beacon captured / lost | SFX | Captured: two rising warm tones. | src/audio.ts | Specced |
| 5 | Low energy warning | SFX | A soft repeating pulse below 30% energy; never alarm-loud. | src/audio.ts | Specced |
| 6 | Round won / lost | SFX | Won: a rising four-note arpeggio. | src/audio.ts | Specced |
| 7 | Music | Music | Title: sparse synth pad, slow. | src/audio.ts | Specced |
