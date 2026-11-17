// Vitest: the online zone server on a real local socket, driven by plain WebSocket clients.
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import config from '../../data/config.json';
import { startZone, cleanName, type Zone } from '../../server/zone';
import { tuningFrom } from '../../src/game/tuning';
import { packInput, PROTOCOL, type ServerMsg, type Snapshot } from '../../src/net/protocol';
import { NO_INPUT } from '../../src/game/types';

const tune = tuningFrom(config);
let zone: Zone | undefined;
afterEach(async () => { await zone?.close(); zone = undefined; });

/** A test pilot: connects, says hello, and collects what the server sends. */
async function pilot(port: number, name: string): Promise<{ ws: WebSocket; msgs: ServerMsg[]; next(t: string): Promise<ServerMsg> }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const msgs: ServerMsg[] = [];
  const waiters: [string, (m: ServerMsg) => void][] = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)) as ServerMsg; msgs.push(m);
    const i = waiters.findIndex(([t]) => t === m.t);
    if (i >= 0) waiters.splice(i, 1)[0][1](m);
  });
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, name }));
  return { ws, msgs, next: t => new Promise(r => { const m = msgs.find(x => x.t === t); if (m && t === 'welcome') r(m); else waiters.push([t, r]); }) };
}

describe('the online zone', () => {
  it('seats a joining pilot in a bot seat, sends snapshots, and gives the seat back on leaving', async () => {
    zone = await startZone({ port: 0, tune, seed: 3 });
    const a = await pilot(zone.port(), 'Ada!!<script>');
    const welcome = await a.next('welcome');
    if (welcome.t !== 'welcome') throw new Error('no welcome');
    expect(zone.world.ships[welcome.you].human).toBe(true);
    expect(zone.world.ships[welcome.you].name).toBe('Adascript');
    const snap = (await a.next('snap')) as Snapshot;
    expect(snap.ships.length).toBe(tune.pilots);
    expect([welcome.mapSeed, welcome.tiles]).toEqual([zone.world.mapSeed, zone.world.tiles]);
    // a second pilot takes another bot seat
    const b = await pilot(zone.port(), 'Bo');
    const wb = await b.next('welcome');
    if (wb.t !== 'welcome') throw new Error('no welcome');
    expect(wb.you).not.toBe(welcome.you);
    expect(zone.pilots()).toBe(2);
    b.ws.close();
    await expect.poll(() => zone!.pilots()).toBe(1);
    expect(zone.world.ships[wb.you].human).toBe(false);
    a.ws.close();
  });

  it('applies a pilot\'s inputs and acknowledges them', async () => {
    zone = await startZone({ port: 0, tune, seed: 3 });
    const a = await pilot(zone.port(), 'Ada');
    const w = await a.next('welcome');
    if (w.t !== 'welcome') throw new Error('no welcome');
    a.ws.send(JSON.stringify({ t: 'in', seq: 5, bits: packInput({ ...NO_INPUT, thrust: true }), hull: 0 }));
    await expect.poll(() => a.msgs.filter((m): m is Snapshot => m.t === 'snap').some(s => s.ack === 5)).toBe(true);
    expect(zone.world.ships[w.you].thrusting).toBe(true);
    a.ws.close();
  });

  it('cleans call signs', () => {
    expect(cleanName('  ')).toBe('Pilot');
    expect(cleanName('a'.repeat(40)).length).toBe(16);
  });
});
