// Fetches (or renews) the HTTPS certificate for this Mac's Tailscale name and
// writes certs/ts.pem + certs/ts.key. The server picks the new files up by itself.
// Must run from a normal terminal session (Tailscale's folder is protected by
// macOS privacy rules for background jobs).
//
//   node --env-file=.env renew-ts-cert.mjs

import { readdirSync, writeFileSync } from 'node:fs';

const host = process.env.TS_HOST;
if (!host) { console.error('TS_HOST is missing in .env'); process.exit(1); }
const dir = `${process.env.HOME}/Library/Group Containers/W5364U7YZB.group.io.tailscale.ipn.macos`;
const proof = readdirSync(dir).find((f) => f.startsWith('sameuserproof-'));
if (!proof) { console.error('Tailscale app is not running (no local API file).'); process.exit(1); }
const [, port, ...token] = proof.split('-');
const r = await fetch(`http://127.0.0.1:${port}/localapi/v0/cert/${host}?type=pair`, { headers: { Authorization: `Basic ${Buffer.from(`:${token.join('-')}`).toString('base64')}` } });
const out = await r.text();
const certs = out.match(/-----BEGIN CERTIFICATE-----[^]*?-----END CERTIFICATE-----\n/g) || [];
const key = (out.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[^]*?-----END [A-Z ]*PRIVATE KEY-----\n/) || [])[0];
if (!r.ok || !certs.length || !key) { console.error('Tailscale did not return a certificate:', r.status, out.slice(0, 200)); process.exit(1); }
writeFileSync('certs/ts.pem', certs.join('')); writeFileSync('certs/ts.key', key);
console.log(`Certificate for ${host} written.`);
