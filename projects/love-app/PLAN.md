# Love App: shared photo widget (free route) — Implementation Plan

**Overall Progress:** `0%`

## TLDR
Ali and his girlfriend each send a photo in two taps from the iPhone share sheet ("Send to love").
It shows up instantly as a notification with the photo on the other phone, and on the big home-screen
widget within a few minutes. Everything is free: iOS Shortcuts, two free App Store apps, and a small
Vercel backend on the free plan. Install on her side is three links, no cable, no Mac.

## Critical Decisions
- **Widget = Scriptable (free app)** - the only free way to get a custom photo widget; it loads the
  partner's latest photo from our server. iOS decides when widgets refresh; the script asks for a refresh
  every minute, which in practice lands at roughly 1 to 15 minutes.
- **Instant part = ntfy notification with the photo (free app)** - widgets can't be forced to reload
  remotely for free, so the photo also arrives as a push notification the second it's sent.
  Its iOS app now shows image previews in the banner (recent release, verify in Step 5).
- **Sending = an iOS Shortcut in the share sheet** - built into every iPhone, shared by iCloud link;
  shrinks the photo to about 1600 px before upload so it's fast on mobile data.
- **Backend = small Vercel app in this folder, photos in Vercel Blob** - Ali's usual stack and deploy
  routine, free Hobby plan.
- **No accounts, no pairing flow** - just two people, each with a secret key baked into their own Shortcut
  and widget script. Photo addresses are long random links nobody can guess.

## Tasks:

- [ ] 🟥 **Step 1: Project setup**
  - [ ] 🟥 `CLAUDE.md` (what, where it runs, deploy, forbidden), `.gitignore`, `.env` with the two keys
  - [ ] 🟥 One row in `projects/README.md`

- [ ] 🟥 **Step 2: Backend (Vercel)**
  - [ ] 🟥 `POST /api/photo` with sender key → save to Blob → ping the partner's ntfy topic with the photo
  - [ ] 🟥 `GET /api/latest` with reader key → the partner's newest photo and when it was sent
  - [ ] 🟥 `GET /api/all` with reader key → simple page of every photo received, newest first
  - [ ] 🟥 Deploy and check with a test upload from the Mac

- [ ] 🟥 **Step 3: "Send to love" Shortcut**
  - [ ] 🟥 Share sheet input (photos) + "take a photo" when run from the home screen
  - [ ] 🟥 Resize, convert to JPEG, upload, show "Sent"
  - [ ] 🟥 One copy per person (own key), shared by iCloud link

- [ ] 🟥 **Step 4: Widget script (Scriptable)**
  - [ ] 🟥 Large widget: partner's latest photo full-bleed, small "sent 3 min ago" label
  - [ ] 🟥 Ask for refresh every minute; keep last photo on screen if offline
  - [ ] 🟥 Tap the widget → opens the "all photos" page

- [ ] 🟥 **Step 5: Install on both phones**
  - [ ] 🟥 Short install page for her: install Scriptable + ntfy → open script link → open Shortcut link
        → subscribe to her topic → add the large widget
  - [ ] 🟥 Same on Ali's phone first to test the steps

- [ ] 🟥 **Step 6: Verify end to end**
  - [ ] 🟥 Notification with photo arrives in seconds, both directions
  - [ ] 🟥 Widget shows the new photo; note how long it takes over a day
  - [ ] 🟥 Works on mobile data, phone locked, after a restart
