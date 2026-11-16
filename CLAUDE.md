# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: Web (Vite 8.3.4, TypeScript 7.0.2, PixiJS 8.22.0)
- **Language**: TypeScript
- **Version Control**: Git with trunk-based development
- **Build System**: Vite — `npm run build` for `dist/`, `npm run build:single` for one self-contained HTML file
- **Asset Pipeline**: plain files in `assets/`, imported in the code; every asset's source and license in `assets/provenance.yaml`

> **Note**: This is a web game, so the Godot, Unity and Unreal specialist agents
> in `.claude/agents/` are not used. Engine work and API checks go to
> `lead-programmer` against `docs/engine-reference/web/` (see `pixijs.md`).

## This Game

**Space Wars** (working title): a modern, original take on the classic
top-down multiplayer 2D space-combat arena genre, made to sell on Steam.
The concept is not designed yet; run `/brainstorm` or `/start` to write it.
Rules for every agent:

- **Original IP only.** The game is inspired by the genre of Continuum and
  SubSpace but must not copy them: no names, ship names, maps, art, sounds,
  UI layouts, zone names, chat commands or exact tuning numbers from them or
  any other existing game. Every asset needs a commercial-use license recorded
  in `assets/provenance.yaml`.
- **Multiplayer is the core.** Keep the rules in `src/game/` pure and
  deterministic (no DOM, no Pixi, seeded RNG) so the same simulation can run on
  a server and be tested headlessly. Networking decisions get an ADR.
- **Steam is the target.** The browser build is for development and playtests;
  shipping on Steam needs a desktop wrapper (decided by ADR before release).

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

<!-- ENGINE-REFERENCE-IMPORT: the line under this comment is engine-specific,
     and there is none until an engine is set. /setup-engine, the grow's record
     step and /project-settings (engine.name) write
     @docs/engine-reference/<engine>/VERSION.md here for the chosen engine. Skills
     that need the pinned version read that file on demand either way. -->
@docs/engine-reference/web/VERSION.md


## Technical Preferences

`project.yaml` at the repo root is the primary config store — engine, specialists,
naming, platform, performance, modes. Skills resolve it via `resolve_config`
(see `.claude/docs/config-resolution.md`).

`.claude/docs/technical-preferences.md` is the **legacy fallback**, read on demand
when a key is absent from `project.yaml`. It is not imported here: before
`/setup-engine` runs it is almost entirely `[TO BE CONFIGURED]` placeholders, and
after it runs `project.yaml` holds the real values.

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
  (exempt: `active.md` appends, agent memory, a subagent's new file at the path
  its orchestrating skill named; see `.claude/rules/agent-memory.md`)
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction
- A skipped or dismissed question is not an answer: act on nothing, re-ask in
  plain text and wait
- Started outside this file's folder? Warn first: hooks, deny rules and the
  ask-first mode load only when Claude Code starts here

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** Say "make me a game" (`/prototype`), or run `/start` to begin
> the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

Read `.claude/docs/context-management.md` on demand — it is a reference, not
session context. Two of its conventions are load-bearing and cited by name
elsewhere in the repo, so they are restated here rather than lost:

- **`production/session-state/active.md` is the session checkpoint.** The file is
  the memory, not the conversation. Read it first after any compaction, crash, or
  `/clear`.
- **Helpers in `.claude/scripts/` emit observations, never verdicts.** A script
  that scores or judges will eventually contradict a mode or override it cannot
  see. (Cited by `artifact-check.sh` and `adr-dep-graph.sh`.)
