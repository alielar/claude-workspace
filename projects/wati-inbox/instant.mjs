// Instant alert for one lead: every new message is pushed the moment the app sees it (≤ 45 s), not when the draft is ready.
//   node instant.mjs <waId> [hours]   on for that many hours (default 3)
//   node instant.mjs <waId> off       off now
import { setState } from './db.mjs';

const [waId, arg = '3'] = process.argv.slice(2);
if (!/^\d{8,15}$/.test(waId || '')) { console.error('usage: node instant.mjs <waId> [hours|off]'); process.exit(1); }
if (arg === 'off') { setState(`instant_${waId}`, ''); console.log(`Instant alert off for ${waId}.`); process.exit(0); }
const hours = Number(arg);
if (!(hours > 0 && hours <= 72)) { console.error('hours must be between 0 and 72'); process.exit(1); }
const until = new Date(Date.now() + hours * 3600e3);
setState(`instant_${waId}`, until.toISOString());
console.log(`Instant alert on for ${waId} until ${until.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })} Madrid.`);
