# Space Wars (working title)

A modern, original top-down multiplayer space-combat game for Steam, in the spirit of the classic 2D space arena
shooters. Built with TypeScript, Vite and PixiJS 8, and developed with a Claude Code game-studio workspace.

## Play and test

```bash
npm ci           # install the pinned versions
npm run dev      # play while working (Vite dev server)
npm test         # Vitest unit tests, then Playwright on the single-file build
npm run build    # production build in dist/
```

Right now the game is the template's starter (a title screen and a moving square). The real game starts with the
concept: run `/brainstorm` or `/start` in Claude Code.

## The studio workspace

Built from [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (MIT, see
`THIRD_PARTY_NOTICES.md`) and configured for this game. It gives Claude Code 49 specialist agents (designers,
programmers, art, audio, QA, producer), 78 slash commands, hooks and doc templates. Open Claude Code in this folder (the
hooks and permissions load only when it starts here).

| Goal | Commands |
|---|---|
| Pin down the concept | `/brainstorm`, `/prototype`, `/art-bible`, `/map-systems` |
| Design a system (ships, weapons, arenas, netcode) | `/design-system`, `/quick-design`, `/design-review`, `/architecture-decision` |
| Plan the work | `/create-epics`, `/create-stories`, `/sprint-plan`, `/sprint-status` |
| Build and check | `/dev-story`, `/code-review`, `/smoke-check`, `/perf-profile` |
| Balance and feel | `/balance-check`, `/playtest-report`, `/team-combat`, `/team-polish` |
| Ship on Steam | `/cut`, `/launch-checklist`, `/release-checklist`, `/patch-notes` |

Not sure what to do next? `/next-step`. The full upstream guide is `docs/CLAUDE-CODE-GAME-STUDIOS.md`.
