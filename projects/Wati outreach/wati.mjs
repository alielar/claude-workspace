// Shared Wati connection helper. Used by every other script in this folder.

const rawEndpoint = (process.env.WATI_ENDPOINT || '').trim().replace(/\/+$/, '');
const rawToken = (process.env.WATI_TOKEN || '').trim().replace(/^Bearer\s+/i, '');

export function checkKeys() {
  const problems = [];
  if (!rawEndpoint) problems.push('WATI_ENDPOINT is empty in the .env file.');
  else if (!/^https?:\/\//.test(rawEndpoint)) problems.push(`WATI_ENDPOINT should start with https:// — got "${rawEndpoint}".`);
  if (!rawToken) problems.push('WATI_TOKEN is empty in the .env file.');
  else if (rawToken.length < 40) problems.push('WATI_TOKEN looks too short — it should be a very long string.');
  return problems;
}

export const endpoint = rawEndpoint;

// Calls Wati and returns the parsed response, or throws a plain-English error.
export async function wati(path, { method = 'GET', body } = {}) {
  const url = `${endpoint}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Could not reach Wati at ${url}. Check the endpoint address and your internet connection. (${err.message})`);
  }

  const text = await res.text();

  if (res.status === 401 || res.status === 403) {
    throw new Error('Wati rejected the access token. Copy it again from the Wati dashboard — make sure nothing is missing from either end.');
  }
  if (res.status === 404) {
    throw new Error(`Wati returned "not found" for ${url}. The endpoint address in .env is probably wrong — it should look like https://live-mt-server.wati.io/123456 with no extra path after the number.`);
  }
  if (res.status === 429) {
    throw new Error('Wati is rate limiting us — too many requests too fast. Wait a minute and try again.');
  }
  if (!res.ok) {
    throw new Error(`Wati returned error ${res.status}. Response: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Wati sent back something that wasn't readable data. First part of it: ${text.slice(0, 300)}`);
  }
}
