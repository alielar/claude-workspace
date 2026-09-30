// Consolidates the learned cases (2026-09-30, Ali's request): the raw journal
// ../Wati outreach/playbook/04-CAS-APPRIS.md grows every day and repeats itself; before each draft
// Claude used to read only its last 200 lines. Now one Sonnet run per evening rebuilds
// ../Wati outreach/playbook/06-REGLES-APPRISES.md — every rule, once, latest decision first, scripts
// verbatim, 150–250 lines — and every draft reads that file in full, plus whatever was appended to
// the journal since the last consolidation (marker line `<!-- consolidé jusqu'ici · … -->`).
//
//   node --env-file=.env consolidate-engine.mjs            rebuild now if the journal moved
//   node --env-file=.env consolidate-engine.mjs --force    rebuild now regardless

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getState, setState } from './db.mjs';
import { runClaude, OUTREACH, madrid, unconsolidatedTail, JOURNAL, RULES } from './suggest-engine.mjs';

const AT = process.env.CONSOLIDATE_AT || '22:15'; // Madrid, after the nightly review (21:03) has written its block
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'consolidate:', ...a);
const status = { state: 'idle', at: null, last: null, error: null };
export const consolidateStatus = () => status;

const SCHEMA = { type: 'object', properties: { markdown: { type: 'string' }, summary: { type: 'string' }, dropped: { type: 'array', items: { type: 'string' } } }, required: ['markdown', 'summary', 'dropped'] };

export async function consolidate({ force = false, actor = 'auto' } = {}) {
  if (status.state === 'running') return { skipped: 'déjà en cours' };
  const tail = unconsolidatedTail();
  if (!force && !tail.trim()) return { skipped: 'rien de nouveau depuis la dernière consolidation' };
  status.state = 'running'; status.at = new Date().toISOString(); status.error = null;
  try {
    const journal = readFileSync(JOURNAL, 'utf8');
    const previous = existsSync(RULES) ? readFileSync(RULES, 'utf8').replace(/^# [^\n]*\n(?:_[^\n]*_\n)?\n?/, '') : '';
    const lines = journal.split('\n').length;
    const prompt = readFileSync(new URL('./consolidate-prompt.md', import.meta.url), 'utf8')
      .replaceAll('{{now}}', madrid()).replaceAll('{{lines}}', String(lines))
      .replaceAll('{{previous}}', previous.trim() || '(vide — première consolidation)')
      .replaceAll('{{journal}}', journal);
    const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 3, tag: 'consolidate', timeoutMs: 8 * 60_000, tools: ['Read'] });
    const md = String(out.markdown || '').trim();
    const heads = (md.match(/^## /gm) || []).length, n = md.split('\n').length;
    if (md.length < 1500 || heads < 6 || n > 400) throw new Error(`résultat suspect (${md.length} caractères, ${heads} sections, ${n} lignes) — fichier inchangé`);
    const stamp = madrid();
    const header = `# Règles apprises — consolidées\n\n_Reconstruit le ${stamp} par l'app à partir de \`04-CAS-APPRIS.md\` (${lines} lignes). Lu en entier avant chaque brouillon. Ne pas éditer à la main : les nouveaux cas vont dans 04, la consolidation tourne chaque soir à ${AT}._\n\n`;
    writeFileSync(RULES, header + md + '\n');
    appendFileSync(JOURNAL, `\n<!-- consolidé jusqu'ici · ${stamp} -->\n`);
    setState('consolidated_at', stamp);
    status.state = 'idle'; status.last = { at: new Date().toISOString(), lines: n, summary: String(out.summary || ''), dropped: out.dropped || [], actor, ms: out.ms };
    log(`rebuilt ${RULES.split('/').pop()}: ${n} lines from ${lines} journal lines in ${Math.round(out.ms / 1000)} s — ${String(out.summary || '').replace(/\s+/g, ' ').slice(0, 140)}`);
    try { mkdirSync(join(OUTREACH, 'data', 'nightly'), { recursive: true }); appendFileSync(join(OUTREACH, 'data', 'nightly', `${stamp.slice(0, 10)}.md`), `\n## Consolidation des règles apprises (${stamp.slice(11, 16)})\n${String(out.summary || '').trim()}\n${(out.dropped || []).length ? 'Écarté : ' + out.dropped.join(' · ') + '\n' : ''}`); } catch {}
    return status.last;
  } catch (e) {
    status.state = 'idle'; status.error = e.message; log('error:', e.message);
    throw e;
  }
}

export function startConsolidating() {
  setInterval(() => {
    const now = madrid();
    if (now.slice(11, 16) < AT) return;
    if (getState('consolidate_day') === now.slice(0, 10)) return;
    setState('consolidate_day', now.slice(0, 10));
    consolidate({ actor: 'auto' }).then((r) => r?.skipped && log(r.skipped)).catch(() => {});
  }, 5 * 60_000);
  log(`ready — every evening at ${AT} Madrid when the journal moved`);
}

if (process.argv[1] && process.argv[1].endsWith('consolidate-engine.mjs')) {
  mkdirSync('logs', { recursive: true });
  consolidate({ force: process.argv.includes('--force'), actor: 'terminal' })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
