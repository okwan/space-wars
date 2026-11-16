# ADR-0002: The Steam build: Electron around the web game

## Status
Proposed (Oscar to confirm before any Steam work starts)

## Date
2026-11-16

## Decision Makers
Claude (recommendation); Oscar decides

## Summary
Ship on Steam by wrapping the Vite build in Electron, with `steamworks.js` for achievements,
overlay and auth when they are needed. Not built yet.

## Context
CLAUDE.md requires a desktop wrapper decided by ADR before release. The game is a WebGL
(PixiJS) page plus an optional connection to an online zone.

## Decision
Electron, because it ships its own Chromium: the same WebGL and audio on Windows, macOS, Linux
and the Steam Deck as the browser builds we test. The online server stays a separate Node
program.

## Alternatives Considered
### Alternative 1: Tauri
Smaller downloads, but it uses each system's web view (WebKitGTK on Linux and the Deck), where
WebGL and audio behave differently from what we test.
### Alternative 2: NW.js
Similar to Electron with a smaller community and fewer Steam integrations.

## Consequences
### Positive
- One renderer everywhere; Steamworks bindings exist.
### Negative
- About 100 MB per platform download.

## Risks
Steam Deck input: the gamepad mapping in `src/gamepad.ts` is the standard layout; verify on a Deck.

## Validation Criteria
A packaged build runs the title screen and a round on Windows and the Deck with no console errors.
