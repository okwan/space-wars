// Runs one online zone: node dist-server/main.js [port]. PORT and SEED in the environment work too.

import config from '../data/config.json';
import { tuningFrom } from '../src/game/tuning';
import { startZone } from './zone';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const seed = Number(process.env.SEED ?? config.seed);
const zone = await startZone({ port, seed, tune: tuningFrom(config), log: s => console.log(new Date().toISOString(), s) });
console.log(`Beacon Wars zone on ws://localhost:${zone.port()} (seed ${seed})`);
const stop = (): void => { void zone.close().then(() => process.exit(0)); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
