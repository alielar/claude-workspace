import { timingSafeEqual } from 'node:crypto';

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

// The two people. The key in the private link says who is asking.
export function who(key) {
  if (!key) return null;
  if (same(key, process.env.KEY_ALI)) return 'ali';
  if (same(key, process.env.KEY_HER)) return 'her';
  return null;
}

export const partner = (p) => (p === 'ali' ? 'her' : 'ali');
export const topicOf = (p) => (p === 'ali' ? process.env.NTFY_TOPIC_ALI : process.env.NTFY_TOPIC_HER);
export const nameOf = (p) => (p === 'ali' ? (process.env.NAME_ALI || 'Ali') : (process.env.NAME_HER || ''));

export const keyFrom = (request) => {
  const u = new URL(request.url);
  return request.headers.get('x-key') || u.searchParams.get('k');
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Photos are stored under the person who receives them, newest first by name.
export const MAX = 9999999999999;
export const folderFor = (p) => `to-${p}/`;
export const atFromPath = (pathname) => MAX - Number(pathname.split('/')[1].split('-')[0]);
