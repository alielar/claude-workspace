// One-time setup: writes .env with the Wati keys (copied from the Wati outreach
// folder), a generated password for the app, and a fresh push key pair.
// Existing values in .env are kept — delete a line to regenerate it.
//
//   node setup-keys.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const parse = (txt) => Object.fromEntries(txt.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const env = existsSync('.env') ? parse(readFileSync('.env', 'utf8')) : {};
const src = existsSync('../Wati outreach/.env') ? parse(readFileSync('../Wati outreach/.env', 'utf8')) : {};

env.WATI_ENDPOINT ||= src.WATI_ENDPOINT || '';
env.WATI_TOKEN ||= src.WATI_TOKEN || '';
env.PORT ||= '8443';
env.APP_PASSWORD ||= randomBytes(6).toString('base64url');
if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  const k = webpush.generateVAPIDKeys();
  env.VAPID_PUBLIC_KEY = k.publicKey;
  env.VAPID_PRIVATE_KEY = k.privateKey;
}
env.VAPID_SUBJECT ||= 'mailto:ali.elaraki@edueasy.group';

writeFileSync('.env', Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(`.env written. App password: ${env.APP_PASSWORD}${env.WATI_TOKEN ? '' : '\nWARNING: WATI_TOKEN is empty — paste it into .env'}`);
