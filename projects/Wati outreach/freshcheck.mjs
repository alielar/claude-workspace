import { readFileSync, writeFileSync } from 'node:fs';
import { wati } from '/Users/alielaraki/claude-workspace/projects/Wati outreach/wati.mjs';

const ok = readFileSync('logs/sent.jsonl','utf8').split('\n').filter(l=>l.trim()).map(JSON.parse).filter(e=>e.ok);
const FU = new Set(['followup_text_1_fra_v2','followup_text_2_fra','noshow_text_3_france','noshow_text_4_fra']);
const alreadyFU = new Set(ok.filter(e=>FU.has(e.template)).map(e=>e.phone));
const firstSend = new Map();
for (const e of ok) { if (FU.has(e.template)) continue; const t=new Date(e.ts).getTime();
  if(!firstSend.has(e.phone)||t<firstSend.get(e.phone)) firstSend.set(e.phone,t); }

const silent = readFileSync('data/no-reply.csv','utf8').split('\n').slice(1).filter(l=>l.trim())
  .map(l=>l.split(',')).map(f=>({leadId:f[0],name:f[1],phone:f[2].replace(/[^\d]/g,'')}))
  .filter(p=>!alreadyFU.has(p.phone));

const blocked = new Set(readFileSync('data/do-not-contact-full.csv','utf8').split('\n').slice(1)
  .filter(l=>l.trim()).map(l=>l.split(',')).filter(f=>!/false positive/i.test(f[3]||''))
  .map(f=>f[2].replace(/[^\d]/g,'')));

const pool = silent.filter(p=>!blocked.has(p.phone));
console.log(`checking ${pool.length} people for replies since our first message…`);

const found = [];
const C = 8;
for (let i=0;i<pool.length;i+=C) {
  await Promise.all(pool.slice(i,i+C).map(async p => {
    const since = firstSend.get(p.phone) ?? 0;
    try {
      const d = await wati(`/api/v1/getMessages/${p.phone}?pageSize=20&pageNumber=1`);
      for (const m of d.messages?.items||[]) {
        const outbound = m.owner===true || (m.eventDescription||'').includes('Broadcast message');
        const text = (m.text||'').trim();
        if (!outbound && new Date(m.created||0).getTime() > since && text) {
          found.push({...p, reply:text.replace(/[,\n\r]/g,' ').slice(0,150)}); break;
        }
      }
    } catch {}
  }));
}
writeFileSync('data/replied-since.csv','lead_id,name,phone,reply\n'+
  found.map(f=>[f.leadId,f.name,'+'+f.phone,f.reply].join(',')).join('\n')+'\n');
console.log(`\n  ${found.length} have replied since — they must NOT get "you didn't reply"`);
found.forEach(f=>console.log(`   ${f.name} +${f.phone}: ${f.reply.slice(0,90)}`));
