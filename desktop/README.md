# Beacon Wars desktop build (Steam wrapper)

Electron around the one-file web build, as proposed in
`docs/architecture/adr-0002-steam-desktop-wrapper.md`. This folder is self-contained: it has its
own `package.json`, and nothing outside it depends on it, so deleting `desktop/` removes it cleanly.

```sh
cd desktop
npm install          # Electron 45.2.1, electron-builder 26.18.1
npm start            # builds the game, copies it to app/, opens the window (F11: full screen)
npm run pack         # an unpacked app for this OS in release/
```

`--scene=figures` (or any scene name) opens that scene, for checks.

Checked 2026-11-16 in the cloud container (Linux, Xvfb): the window opens with no page errors,
with WebGL (bloom on) and without it (Canvas 2D fallback, bloom off), and `npm run pack` produces a
Linux app that starts.

Not done, because they need the owner: a Steam app id, Steamworks (`steamworks.js`) for overlay
and achievements, code signing, store depots, and testing on Windows and a Steam Deck.
`appId` in `package.json` is a placeholder.
