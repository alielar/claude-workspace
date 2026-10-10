import { readFileSync } from 'node:fs';
import { who, keyFrom, json } from '../lib/people.js';

const template = readFileSync(new URL('../lib/widget-template.js', import.meta.url), 'utf8');

// The personal widget script. ?format=js gives plain text to copy; default is a file Scriptable imports.
export async function GET(request) {
  const key = keyFrom(request);
  if (!who(key)) return json({ error: 'Unknown link' }, 401);
  const u = new URL(request.url);
  const base = `${u.protocol}//${u.host}`;
  const script = template.replace('__BASE__', base).replace('__KEY__', key);
  if (u.searchParams.get('format') === 'js') {
    return new Response(script, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const file = {
    always_run_in_app: false,
    icon: { color: 'pink', glyph: 'heart' },
    name: 'Love',
    script,
    share_sheet_inputs: [],
  };
  return new Response(JSON.stringify(file), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="Love.scriptable"',
      'cache-control': 'no-store',
    },
  });
}
