// The online zone server: one always-running zone that people drop into. It runs the same
// deterministic rules as the browser (src/game/) at a fixed step, takes each pilot's inputs,
// and sends everyone snapshots. Bots fly every empty seat and step out when a person joins.
// Decision record: docs/architecture/adr-0001-online-zone.md.

import { WebSocketServer, type WebSocket } from 'ws';
import { startRound, step, STEP } from '../src/game/sim';
import type { GameEvent, ShipInput, Team, Tuning, World } from '../src/game/types';
import { leaveSeat, newWorld, takeSeat } from '../src/game/world';
import { PROTOCOL, snapshot, unpackInput, type ClientMsg, type ServerMsg } from '../src/net/protocol';

export interface ZoneOptions {
  port: number;
  tune: Tuning;
  seed: number;
  /** Simulation steps between snapshots (3 at 60 Hz is 20 a second). */
  snapEvery?: number;
  /** Most pilots one zone takes (the rest are told it is full). */
  maxPilots?: number;
  log?: (s: string) => void;
}
interface Pilot { ws: WebSocket; id: number; seq: number; input: ShipInput | null; name: string }

/** A running zone. */
export interface Zone {
  world: World;
  pilots(): number;
  port(): number;
  close(): Promise<void>;
}

/** Cleans a call sign: letters, digits, spaces and a few marks, at most 16 characters. */
export function cleanName(s: unknown): string {
  const n = String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  return n || 'Pilot';
}

/** Starts a zone on a port. Resolves once it is listening. */
export function startZone(o: ZoneOptions): Promise<Zone> {
  const log = o.log ?? (() => {});
  const tune = o.tune, every = o.snapEvery ?? 3, max = o.maxPilots ?? tune.fleet_size * 2;
  const world = newWorld(tune, { seed: o.seed, humans: [] });
  startRound(world, tune); world.events = [];
  const pilots = new Map<WebSocket, Pilot>();
  let tick = 0, pending: GameEvent[] = [];
  const send = (ws: WebSocket, m: ServerMsg): void => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

  const wss = new WebSocketServer({ port: o.port, maxPayload: 4096 });
  wss.on('connection', ws => {
    ws.on('message', raw => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)) as ClientMsg; } catch { return; }
      const p = pilots.get(ws);
      if (m.t === 'hello' && !p) {
        if (m.v !== PROTOCOL) { send(ws, { t: 'full', reason: `This zone speaks version ${PROTOCOL}; update the game.` }); ws.close(); return; }
        if (pilots.size >= max) { send(ws, { t: 'full', reason: 'This zone is full.' }); ws.close(); return; }
        // join the fleet with fewer people on it; a bot steps out of its seat
        const humans = [0, 1].map(t => world.ships.filter(s => s.team === t && s.human).length);
        const team: Team = humans[1] < humans[0] ? 1 : 0;
        const name = cleanName(m.name);
        let id = takeSeat(world, team, name);
        if (id < 0) id = takeSeat(world, (1 - team) as Team, name);
        if (id < 0) { send(ws, { t: 'full', reason: 'This zone is full.' }); ws.close(); return; }
        pilots.set(ws, { ws, id, seq: 0, input: null, name });
        send(ws, { t: 'welcome', v: PROTOCOL, you: id, tune, size: world.size, asteroids: world.asteroids });
        log(`join ${name} as ship ${id} (team ${team}); ${pilots.size} pilot(s)`);
      } else if (m.t === 'in' && p) {
        if (typeof m.seq === 'number' && m.seq > p.seq) { p.seq = m.seq; p.input = unpackInput(m.bits | 0, m.hull | 0, m.weapon | 0); }
      } else if (m.t === 'bye' && p) ws.close();
    });
    ws.on('close', () => {
      const p = pilots.get(ws);
      if (!p) return;
      pilots.delete(ws); leaveSeat(world, p.id);
      log(`leave ${p.name}; ${pilots.size} pilot(s)`);
    });
  });

  // the fixed-step loop, on real time; a stall never fast-forwards more than a quarter second
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc += Math.min((now - last) / 1000, 0.25); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      const inputs = new Map<number, ShipInput>();
      for (const p of pilots.values()) if (p.input) {
        inputs.set(p.id, p.input);
        p.input = { ...p.input, mine: false }; // a mine is one press, not a hold
      }
      step(world, inputs, tune, STEP);
      pending.push(...world.events); world.events = [];
      tick++;
      if (tick % every === 0) {
        for (const p of pilots.values()) send(p.ws, snapshot(world, tick, p.seq, pending));
        pending = [];
      }
    }
  }, 4);

  return new Promise(resolve => {
    wss.on('listening', () => {
      const addr = wss.address();
      resolve({
        world,
        pilots: () => pilots.size,
        port: () => (typeof addr === 'object' && addr ? addr.port : o.port),
        close: () => new Promise<void>(done => { clearInterval(timer); for (const p of pilots.values()) p.ws.terminate(); wss.close(() => done()); }),
      });
    });
  });
}
