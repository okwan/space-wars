// The browser side of the online zone: connects, sends this pilot's inputs every step, and keeps
// a copy of the zone from the server's snapshots. Between snapshots everything coasts on its
// velocity (drift physics makes that close to exact), and this pilot's own ship is predicted
// locally and re-played from the last input the server applied, so steering has no lag.

import { fly } from '../game/sim';
import type { GameEvent, ShipInput, Tuning, World } from '../game/types';
import { newWorld } from '../game/world';
import { applySnapshot, packInput, PROTOCOL, type ClientMsg, type ServerMsg, type Snapshot } from './protocol';
import { HULLS } from '../game/types';

export type NetStatus = 'connecting' | 'online' | 'closed';

/** One connection to an online zone. */
export class NetSession {
  status: NetStatus = 'connecting';
  /** Why it closed, for the screen. */
  reason = '';
  world: World | null = null;
  tune: Tuning | null = null;
  you = -1;
  /** Round-trip time in ms, from input acknowledgements. */
  ping = 0;
  private ws: WebSocket;
  private seq = 0;
  private history: { seq: number; input: ShipInput; at: number }[] = [];
  private events: GameEvent[] = [];

  constructor(url: string, name: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.send({ t: 'hello', v: PROTOCOL, name });
    this.ws.onmessage = e => this.receive(JSON.parse(String(e.data)) as ServerMsg);
    this.ws.onclose = () => { if (this.status !== 'closed') { this.status = 'closed'; this.reason ||= 'The connection to the zone closed.'; } };
    this.ws.onerror = () => { this.reason ||= `Could not reach a zone at ${url}.`; };
  }

  private send(m: ClientMsg): void { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private receive(m: ServerMsg): void {
    if (m.t === 'full') { this.reason = m.reason; this.status = 'closed'; this.ws.close(); return; }
    if (m.t === 'welcome') {
      this.tune = m.tune; this.you = m.you;
      const w = newWorld(m.tune, { seed: 1, mapSeed: m.mapSeed, humans: [] });
      this.world = w; this.status = 'online';
      return;
    }
    if (m.t === 'snap' && this.world && this.tune) this.snap(this.world, this.tune, m);
  }

  private snap(w: World, tune: Tuning, s: Snapshot): void {
    const acked = this.history.find(h => h.seq === s.ack);
    if (acked) this.ping = Math.round(performance.now() - acked.at);
    applySnapshot(w, s);
    this.events.push(...s.events);
    // replay this pilot's inputs the server has not applied yet, on its own ship only
    this.history = this.history.filter(h => h.seq > s.ack);
    const me = w.ships[this.you];
    if (me && me.alive) for (const h of this.history) fly(w, me, { ...h.input, fire: false, bomb: false, mine: false }, tune, 1 / 60);
  }

  /** Sends this step's input and moves the local copy on by dt. */
  step(input: ShipInput, dt: number): void {
    const w = this.world, tune = this.tune;
    if (!w || !tune || this.status !== 'online') return;
    this.seq++;
    this.history.push({ seq: this.seq, input, at: performance.now() });
    if (this.history.length > 240) this.history.shift();
    this.send({ t: 'in', seq: this.seq, bits: packInput(input), hull: HULLS.indexOf(input.hull ?? 'lancer') });
    const me = w.ships[this.you];
    for (const sh of w.ships) {
      if (sh === me && sh.alive) { fly(w, sh, { ...input, fire: false, bomb: false, mine: false }, tune, dt); continue; }
      if (!sh.alive) continue;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
    }
    for (const b of w.shots) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const m of w.mines) m.age += dt;
    w.t += dt;
  }

  /** The events that arrived since the last call. */
  drain(): GameEvent[] { const e = this.events; this.events = []; return e; }

  close(): void { this.status = 'closed'; this.send({ t: 'bye' }); this.ws.close(); }
}
