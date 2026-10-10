// Uploads dist/Send to Love (<who>).shortcut to the photo store under shortcuts/<who>-<random>.shortcut.
import { readFileSync } from 'node:fs';
import { put, list, del } from '@vercel/blob';

for (const who of ['ali', 'her']) {
  const old = await list({ prefix: `shortcuts/${who}-` });
  if (old.blobs.length) await del(old.blobs.map((b) => b.url));
  const b = await put(`shortcuts/${who}.shortcut`, readFileSync(`dist/Send to Love (${who}).shortcut`), {
    access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream',
  });
  console.log('uploaded', who, b.pathname.replace(/-[^.]+\./, '-(random).'));
}
