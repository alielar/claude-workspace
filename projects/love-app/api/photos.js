import { list } from '@vercel/blob';
import { who, keyFrom, json, folderFor, atFromPath } from '../lib/people.js';

// The photos the partner sent to the person asking, newest first.
export async function GET(request) {
  const me = who(keyFrom(request));
  if (!me) return json({ error: 'Unknown link' }, 401);
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 60, 500);
  const { blobs } = await list({ prefix: folderFor(me), limit });
  const photos = blobs
    .map((b) => ({ url: b.url, at: atFromPath(b.pathname) }))
    .sort((a, b) => b.at - a.at);
  return json({ me, photos });
}
