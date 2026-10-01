// Sales Hub automation watch (2026-09-30).
//
// The "to be converted" (TBC) sequence is sent by the Sales Hub, not by this app, on a fixed clock
// counted from the day the preadmission template landed (Day 0). A "no reply" step is skipped while
// the lead wrote last and fires as soon as Ali wrote last. This app cannot pause it: only Ali can, in
// the Sales Hub ("Skip next" / the Paused switch). So this module only WARNS him, in two cases:
//
//   fit    — from the recovery week on (Day 2+): Ali asked the lead what REALLY blocks them (the
//            diagnostic question — price, timing, method?) and the lead never answered, so the real
//            issue is still unknown. One Sonnet run confirms it and drafts the manual follow-up; Ali
//            gets a push: pause the step in the Sales Hub, then send the follow-up. If the issue is
//            already known and a solution was proposed (a lighter format, a payment plan…), the
//            templates do their job: nothing is shown (the row is kept as "ok", never judged twice).
//   Leads who received the welcome message (enrolled) are out of scope. There is no "template
//   imminent" warning any more (Ali, 2026-09-30 afternoon): only what does not fit is flagged.
//
// Nothing is sent, nothing is written outside the database. Alerts close by themselves when the lead
// replies, when the step fires anyway (we see the template land), or once the step time has passed.
//
//   node --env-file=.env tbc-watch.mjs            one pass now, prints the candidates (no push, no Claude)
//   node --env-file=.env tbc-watch.mjs --live     one pass with pushes and Claude, like the server

import { readFileSync, mkdirSync } from 'node:fs';
import { activeThreads, threadMessages, getThread, getState, setState, tbcAlert, insertTbcAlert, setTbcAlertState, openTbcAlerts, unpushedTbcAlerts, markTbcAlertPushed, tbcFitRunsSince } from './db.mjs';
import { pushAll } from './push.mjs';
import { runClaude, madrid } from './suggest-engine.mjs';
import { hubReady } from './hub.mjs';

// The Sales Hub schedule (screenshots of 2026-09-30, "TO BE CONVERTED"). Times are Europe/Madrid (= Paris).
export const STEPS = [
  { n: 1, day: 0, at: '20:20', tpl: 'tbc_preadmission', gate: 'always', phase: 'window', text: 'Salut {name}, c’est {owner} d’easypeasy, ça m’a fait plaisir d’échanger avec vous ! On vient de vous envoyer les résultats d’aujourd’hui par mail, vous les avez bien reçus ?' },
  { n: 2, day: 1, at: '14:00', tpl: 'tbc_reminder_1', gate: 'always', phase: 'window', text: 'Salut {name} ! Votre place est réservée jusqu’à ce soir. Vous avez des questions avant la clôture des inscriptions à 20h ?' },
  { n: 3, day: 1, at: '17:00', tpl: 'tbc_reminder_2', gate: 'noreply', phase: 'window', text: 'On est en train de finaliser les groupes des prochains mois. Vous avez pu y réfléchir ?' },
  { n: 4, day: 1, at: '19:00', tpl: 'tbc_reminder_3', gate: 'noreply', phase: 'window', text: 'Avant qu’on clôture aujourd’hui, il y a quelque chose qui vous retient en particulier, comme le prix, le timing ou la méthode ?' },
  { n: 5, day: 2, at: '15:00', tpl: 'tbc_recovery_release', gate: 'noreply', phase: 'recovery', text: 'Salut {name}, j’ai dû libérer votre place, mais je peux peut-être vous en trouver une autre dans un prochain groupe. Vous voulez que je regarde ?' },
  { n: 6, day: 2, at: '18:00', tpl: 'tbc_recovery_waitlist', gate: 'noreply', phase: 'recovery', text: 'Dites-moi, sinon je vais devoir vous mettre sur liste d’attente, et là je ne peux pas vous garantir une place pour les prochains mois. Ça vous va ?' },
  { n: 7, day: 3, at: '16:00', tpl: 'tbc_recovery_offer', gate: 'noreply', phase: 'recovery', text: 'Salut {name}, les places des prochains mois sont complètes et vous êtes maintenant sur liste d’attente. Si vous voulez que je vous prévienne dès qu’une place se libère, dites-le moi. À bientôt !' },
  { n: 8, day: 6, at: '14:30', tpl: 'tbc_reactivation_1', gate: 'noreply', phase: 'recovery', text: 'Salut {name} ! Une place vient de se libérer pour les prochains mois et j’ai pu vous la bloquer temporairement. Elle vous intéresse ?' },
  { n: 9, day: 7, at: '17:30', tpl: 'tbc_reactivation_2', gate: 'noreply', phase: 'recovery', text: 'Sinon pas de souci, dites-moi juste où vous en êtes.' },
];
// Old rows have no template name: recognise the steps by their text.
const TEXT_KEYS = { 1: /résultats d.aujourd.hui par mail/i, 2: /place est réservée jusqu.à ce soir/i, 3: /finaliser les groupes des prochains mois/i, 4: /avant qu.on clôture aujourd.hui/i, 5: /dû libérer (votre|ta) place/i, 6: /mettre sur liste d.attente, et là/i, 7: /maintenant sur liste d.attente/i, 8: /place vient de se libérer pour les prochains mois/i, 9: /^sinon pas de souci, di/i };

const FIT_LEAD_MIN = Number(process.env.TBC_FIT_LEAD_MIN || 240);           // judge a recovery step up to 4 h before it fires
const FIT_MAX_PER_DAY = Number(process.env.TBC_FIT_MAX_PER_DAY || 20);
const FROM_H = Number(process.env.TBC_FROM_H || 8), TO_H = Number(process.env.TBC_TO_H || 22); // no pushes at night
export const SALES_HUB_URL = process.env.SALES_HUB_URL || '';
// The manual follow-up when the 24h window is closed: the approved template that asks for the answer again.
export const CLOSED_TEMPLATE = { name: 'tbc_reminder_3_replied_v2_fr', text: 'Vous auriez un retour rapide à me faire ?' };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'tbc:', ...a);
const status = { state: 'idle', at: null, last: null, error: null };
export const tbcWatchStatus = () => status;

// "2026-09-30" + "17:00" in Europe/Madrid → ISO instant.
export function madridInstant(dateStr, hhmm) {
  const guess = Date.parse(`${dateStr}T${hhmm}:00Z`);
  const local = madrid(new Date(guess)); // what that instant reads in Madrid
  const offsetMs = Date.parse(local.replace(' ', 'T') + 'Z') - guess;
  return new Date(guess - offsetMs).toISOString();
}
const madridDate = (iso) => madrid(new Date(iso)).slice(0, 10);
const madridHour = () => Number(madrid().slice(11, 13));
// The lead enrolled: the welcome template (or Ali's welcome line) is in the thread, or the CRM says sale.
const ENROLLED = /^(bienvenue chez easypeasy|bienvenu(e)? parmi nous)/i;
const enrolled = (msgs, t) => /^(sale|won|inscrit|enrolled|client)/i.test(String(t?.stage || '')) || msgs.some((m) => m.who === 'US' && ((m.tpl_name && /^sales_text_1/.test(m.tpl_name)) || ENROLLED.test(String(m.text || '').trim())));
// Ali's diagnostic question: he is still trying to learn what blocks the lead.
const DIAGNOSTIC = /(qu.est-ce qui|ce qui|quoi) (vous|te|t.)\s?(retient|freine|bloque|fait hésiter|gêne|empêche|dérange)|le prix, le timing|prix, timing|timing, la méthode|autre chose\s*\?|toujours le prix|vrai (frein|blocage|souci|problème)|(quel|quelle) (est|serait) (le|la|votre) (souci|problème|frein|blocage|raison)|où (ça )?en (êtes|es)|ce qui (vous |te )?(pose|fait) (souci|problème)/i;
const stepOf = (m) => { if (!m.tpl) return null; for (const s of STEPS) if ((m.tpl_name && m.tpl_name.startsWith(s.tpl)) || (!m.tpl_name && TEXT_KEYS[s.n].test(m.text || ''))) return s; return null; };

// Where one lead stands in the sequence: Day 0, the steps already landed, who wrote last, the next step that will fire.
export function tbcState(waId, now = Date.now()) {
  const msgs = threadMessages(waId);
  if (!msgs.length) return null;
  const t = getThread(waId);
  const pre = msgs.find((m) => stepOf(m)?.n === 1);
  const day0 = pre ? madridDate(pre.at) : (t?.meeting ? String(t.meeting).slice(0, 10) : null);
  if (!day0 || !/^\d{4}-\d{2}-\d{2}$/.test(day0)) return null;
  const day0Ms = Date.parse(madridInstant(day0, '00:00'));
  if (now - day0Ms > 9 * 864e5 || now < day0Ms) return null; // out of the 8-day sequence
  const sentSteps = new Set(msgs.filter((m) => m.at >= day0).map((m) => stepOf(m)?.n).filter(Boolean));
  const lastLead = [...msgs].reverse().find((m) => m.who === 'LEAD');
  const lastHuman = [...msgs].reverse().find((m) => m.who === 'US' && !m.tpl);
  const last = msgs[msgs.length - 1];
  const leadWaiting = !!lastLead && (!lastHuman || lastHuman.at < lastLead.at); // Ali owes an answer → "no reply" steps skip
  const steps = STEPS.map((s) => {
    const d = new Date(day0Ms + s.day * 864e5);
    const firesAt = madridInstant(madrid(d).slice(0, 10), s.at);
    return { ...s, firesAt, sent: sentSteps.has(s.n), past: Date.parse(firesAt) < now - 15 * 60e3 };
  });
  const next = steps.find((s) => !s.sent && !s.past && (s.gate === 'always' || !leadWaiting)) || null;
  return { waId, name: t?.name || '', day0, steps, next, lastLead, lastHuman, last, leadWaiting, enrolled: enrolled(msgs, t), windowOpen: !!lastLead && now - Date.parse(lastLead.at) < 24 * 3600e3, msgs };
}

// Ali's last burst: his bubbles after the lead's last message, within 10 min of his last one — the outstanding question lives there.
function lastBurst(st) {
  if (!st.lastHuman) return [];
  const end = Date.parse(st.lastHuman.at), floor = st.lastLead ? Date.parse(st.lastLead.at) : 0;
  return st.msgs.filter((m) => m.who === 'US' && !m.tpl && end - Date.parse(m.at) < 10 * 60e3 && Date.parse(m.at) <= end && Date.parse(m.at) > floor);
}
const fmtHM = (iso) => madrid(new Date(iso)).slice(11, 16);
const inMin = (iso, now = Date.now()) => Math.round((Date.parse(iso) - now) / 60e3);

// One pass over the active threads. dry = print only. Passes never overlap (a judgement takes ~1 min).
let running = false;
export async function watch({ dry = false, now = Date.now() } = {}) {
  if (running) return [];
  running = true;
  status.state = 'running'; status.at = new Date().toISOString();
  const out = [];
  try {
    // 1. Close what is over: lead replied, template landed anyway, or the moment passed.
    for (const a of openTbcAlerts()) {
      const st = tbcState(a.wa_id, now);
      const fired = st?.steps.find((s) => s.n === a.step)?.sent;
      const replied = st?.lastLead && Date.parse(st.lastLead.at) > Date.parse(a.at);
      if (replied) setTbcAlertState(a.id, 'replied');
      else if (fired) { setTbcAlertState(a.id, 'fired'); if (a.state === 'paused' && !dry) await pushAll({ title: `Le template est parti quand même · ${a.name || a.wa_id}`, body: `${a.tpl} a été envoyé malgré la pause. Vérifiez le Sales Hub`, tag: `tbc-${a.wa_id}`, url: `/t/${a.wa_id}` }); }
      else if (Date.parse(a.fires_at) < now - 30 * 60e3 && a.state === 'open') setTbcAlertState(a.id, 'expired');
    }
    // 2. Look at every lead inside the sequence.
    for (const t of activeThreads(9)) {
      const st = tbcState(t.wa_id, now);
      if (!st?.next || st.leadWaiting || !st.lastHuman || st.enrolled) continue; // nothing fires while the lead is waiting for Ali; enrolled leads are out
      const s = st.next, mins = inMin(s.firesAt, now);
      // fit: recovery week, Ali's last burst is the diagnostic question, the lead never answered it, the step is near.
      if (s.phase !== 'recovery' || mins > FIT_LEAD_MIN || mins < 10) continue; // a judgement takes about a minute
      if (tbcAlert(t.wa_id, st.day0, s.n, 'fit')) continue;
      const burst = lastBurst(st);
      if (!burst.some((m) => /\?/.test(m.text || '') && DIAGNOSTIC.test(m.text || ''))) continue;
      if (!st.lastLead) continue;
      const question = burst.map((m) => m.text).join(' / ').slice(0, 400);
      if (dry) { out.push({ wa_id: t.wa_id, name: st.name, step: s.n, day0: st.day0, kind: 'fit?', fires_at: s.firesAt, tpl: s.tpl, question }); continue; }
      if (tbcFitRunsSince(madridInstant(madrid().slice(0, 10), '00:00')) >= FIT_MAX_PER_DAY) { log('fit cap reached today'); continue; }
      let verdict;
      try { verdict = await judge(st, s, question); }
      catch (e) { log(t.wa_id, 'judge error:', e.message); continue; }
      // Window closed: no free text can leave — the card offers the approved template instead (CLOSED_TEMPLATE), not Claude's bubbles.
      const a = { wa_id: t.wa_id, name: st.name, step: s.n, day0: st.day0, kind: 'fit', state: verdict.fits ? 'ok' : 'open', fires_at: s.firesAt, tpl: s.tpl, tpl_text: s.text, question, question_at: st.lastHuman.at, why: verdict.why, bubbles: verdict.fits || !st.windowOpen ? null : verdict.bubbles, window_open: st.windowOpen };
      try { insertTbcAlert(a); } catch (e) { log(t.wa_id, 'insert:', e.message); continue; }
      const timing = tbcAlert(t.wa_id, st.day0, s.n, 'timing'); // one card per step: the judged one replaces the plain timing warning
      if (timing && timing.state === 'open') setTbcAlertState(timing.id, 'expired');
      out.push(a);
      log(`${st.name || t.wa_id}: ${s.tpl} at ${fmtHM(s.firesAt)} — ${verdict.fits ? 'fits' : 'PAUSE'} (${verdict.why.slice(0, 80)})`);
    }
    // 3. Push the new open alerts (daytime only; the rest waits for the next pass).
    if (!dry && madridHour() >= FROM_H && madridHour() < TO_H) {
      for (const a of unpushedTbcAlerts()) {
        await pushAll({ title: `Pause Sales Hub · ${a.name || a.wa_id}`, body: `${a.tpl} part à ${fmtHM(a.fires_at)}. À mettre en pause, puis relance manuelle`, tag: `tbc-${a.wa_id}`, url: `/t/${a.wa_id}` });
        markTbcAlertPushed(a.id);
      }
    }
    status.state = 'idle'; status.last = new Date().toISOString(); status.error = null;
  } catch (e) { status.state = 'idle'; status.error = e.message; log('watch error:', e.message); }
  finally { running = false; }
  return out;
}

const SCHEMA = { type: 'object', properties: { fits: { type: 'boolean' }, why: { type: 'string' }, bubbles: { type: 'array', items: { type: 'string' } } }, required: ['fits', 'why', 'bubbles'] };

// One Sonnet run: does the next template fit after Ali's unanswered question? If not, the follow-up to send instead.
async function judge(st, step, question) {
  const transcript = st.msgs.slice(-30).map((m) => `[${madrid(new Date(m.at)).slice(5, 16)}] ${m.who === 'LEAD' ? 'LEAD' : m.tpl ? `TEMPLATE ${m.tpl_name || ''}` : 'ALI'} : ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const prompt = readFileSync(new URL('./tbc-fit-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{name}}', st.name || 'prénom inconnu').replaceAll('{{waId}}', st.waId).replaceAll('{{now}}', madrid())
    .replaceAll('{{transcript}}', transcript).replaceAll('{{question}}', question).replaceAll('{{questionAt}}', fmtHM(st.lastHuman.at))
    .replaceAll('{{tpl}}', step.tpl).replaceAll('{{tplAt}}', fmtHM(step.firesAt)).replaceAll('{{tplText}}', step.text.replace('{name}', (st.name || '').split(' ')[0] || 'X').replace('{owner}', 'Ali'))
    .replaceAll('{{windowNote}}', st.windowOpen ? 'La fenêtre de 24h est ouverte : un message libre peut partir.' : 'La fenêtre de 24h est FERMÉE : seul un template peut partir — propose alors le template « tbc_reminder_3_replied_v2_fr » (« Vous auriez un retour rapide à me faire ? ») dans `bubbles`, une seule bulle, en le nommant.');
  const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 4, tag: 'tbc', timeoutMs: 4 * 60_000, tools: ['Read'] });
  return { fits: !!out.fits, why: String(out.why || '').trim().slice(0, 500), bubbles: (Array.isArray(out.bubbles) ? out.bubbles : []).map((b) => String(b).trim()).filter(Boolean).slice(0, 3) };
}

export function startTbcWatch(everyMs = 60_000) {
  mkdirSync('logs', { recursive: true });
  if (hubReady()) { log('off — the Sales Hub mirror (hub-sync.mjs) and the day plan (plan-engine.mjs) replace this guessed schedule'); return; }
  setInterval(() => watch().catch((e) => log('error:', e.message)), everyMs);
  log(`watch ready — every ${Math.round(everyMs / 1000)} s, judges a recovery step up to ${FIT_LEAD_MIN} min ahead when the diagnostic question went unanswered, ${FIT_MAX_PER_DAY} judgements/day`);
}

if (process.argv[1] && process.argv[1].endsWith('tbc-watch.mjs')) {
  const live = process.argv.includes('--live');
  const res = await watch({ dry: !live });
  for (const a of res) console.log(`${a.kind.padEnd(7)} ${a.name || a.wa_id} (+${a.wa_id}) step ${a.step} ${a.tpl} at ${fmtHM(a.fires_at)} · day0 ${a.day0}\n        ${a.question || ''}${a.why ? `\n        → ${a.why}` : ''}`);
  if (!res.length) console.log('no candidate right now');
  // also print where each active lead stands
  for (const t of activeThreads(9)) { const st = tbcState(t.wa_id); if (st?.next) console.log(`  ${(st.name || t.wa_id).padEnd(22)} day0 ${st.day0} · next #${st.next.n} ${st.next.tpl} ${fmtHM(st.next.firesAt)} (${inMin(st.next.firesAt)} min) · ${st.enrolled ? 'ENROLLED → ignored' : st.leadWaiting ? 'lead waiting → skipped' : 'will fire'}`); }
  process.exit(0);
}
