# Love — shared photo widget for Ali and his girlfriend

## What it is
Each of them sends a photo (Love page on the Home Screen, or "Send to Love" in the Photos share menu).
The other one gets it instantly as an ntfy notification with the photo, and on a large Scriptable
widget within a few minutes (iOS decides widget refreshes; the script asks every minute).
Two people only, no accounts: each has a private key inside their links, script and shortcut.

## Where it runs
- Vercel project `love-app`, live at https://love-app-phi-virid.vercel.app (free Hobby plan).
- Photos in Vercel Blob store `love-photos` (public, random unguessable addresses), under
  `to-ali/` and `to-her/`, file names start with an inverted timestamp so newest sorts first.
  Signed shortcuts under `shortcuts/`.
- Notifications through ntfy.sh (free), one secret topic per person.
- Pages: `/?k=KEY` (send + all photos), `/setup.html?k=KEY` (install steps).
  API: `api/photo` (POST upload), `api/photos`, `api/me`, `api/script` (widget code), `api/shortcut`.
- Private setup links for both phones: `data/links.txt` (git-ignored).

## How to deploy
- `cd projects/love-app && npx vercel --prod --yes`, then open the home page.
- If the address or a key changes: `python3 tools/build-shortcuts.py <live address>`, then
  `node tools/upload-shortcuts.mjs` with `.env.local` loaded (rebuilds the signed shortcuts),
  and both people re-copy the widget code from their setup page.
- Keys and topics: `.env` (git-ignored) and Vercel production env. `NAME_HER` (optional) puts her
  name in Ali's notifications ("<name> sent a photo"); without it they say "New photo".

## Forbidden
- Never print the keys, topics or setup links in a message, a commit or a log.
- Never browse, download or show the photos themselves; they are private. Tests use generated images
  and are deleted afterwards.
- Never delete photos without Ali asking.
