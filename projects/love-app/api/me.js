import { who, topicOf, keyFrom, json } from '../lib/people.js';

// What the setup page needs to know about the person holding this link.
export async function GET(request) {
  const me = who(keyFrom(request));
  if (!me) return json({ error: 'Unknown link' }, 401);
  return json({ me, topic: topicOf(me) });
}
