# Love App: shared photo widget — Implementation Plan

**Overall Progress:** `0%`

## TLDR
A tiny iPhone app for Ali and his girlfriend. One tap opens the camera, snap, and the photo appears on the
other person's big home-screen widget within seconds. Each phone's widget always shows the partner's latest
photo; tapping it opens the app with every photo received. Installed on her phone from a link (TestFlight),
no cable, no setup beyond typing a pairing code once.

## Critical Decisions
- **Native SwiftUI app + WidgetKit** — iPhone widgets only come from a real app; Scriptable/Shortcuts
  workarounds refresh every 15+ minutes at best, which is not "smooth".
- **Widget push updates (iOS 26 WidgetKit push)** — the server tells the partner's widget to reload the
  moment a photo lands, instead of waiting for iOS's refresh budget.
- **TestFlight distribution (Apple Developer Program, 99 $/year)** — the only way to put the app on her
  phone remotely without it expiring every 7 days. Needs Ali's go before paying.
- **Small Vercel backend in this folder** — Ali's usual stack and deploy routine: one upload endpoint, one
  "latest photo" endpoint, photos in Vercel Blob, pairing in a tiny key-value store.
- **Pairing by 6-digit code, no accounts** — first launch: one person creates a code, the other types it.
  Nothing else to sign up for.
- **Photos shrunk on the phone before upload** (about 1600 px, JPEG) — fast send on mobile data, and widgets
  cannot display large images anyway.

## Tasks:

- [ ] 🟥 **Step 0: Prerequisites (Ali)**
  - [ ] 🟥 Confirm the 99 $/year Apple Developer Program, then enrol
  - [ ] 🟥 Install Xcode from the Mac App Store (only command-line tools are on the Mac today)
  - [ ] 🟥 Create an APNs push key (.p8) in the developer account, stored in `.env`

- [ ] 🟥 **Step 1: Project setup**
  - [ ] 🟥 `CLAUDE.md` (what, where it runs, deploy, forbidden), `.gitignore`, `.env`
  - [ ] 🟥 One row in `projects/README.md`

- [ ] 🟥 **Step 2: Backend (Vercel)**
  - [ ] 🟥 `POST /pair` create code · `POST /pair/join` join with code → returns a private device token
  - [ ] 🟥 `POST /photo` upload → store in Blob → push "reload" to the partner's widget
  - [ ] 🟥 `GET /photos` partner's photos, newest first (widget reads the first one)
  - [ ] 🟥 Deploy and check with a test upload

- [ ] 🟥 **Step 3: iPhone app**
  - [ ] 🟥 First launch: create or enter pairing code, allow notifications
  - [ ] 🟥 Main screen opens straight on the camera: snap → sent, with a "pick from library" button
  - [ ] 🟥 Shrink + upload in the background so the app can be closed right away
  - [ ] 🟥 "Received" screen: all of the partner's photos, newest first

- [ ] 🟥 **Step 4: Widget**
  - [ ] 🟥 Large widget (plus medium/small) showing the partner's latest photo full-bleed with the time it was sent
  - [ ] 🟥 Register for widget push updates; reload on push, fallback refresh every 15 min
  - [ ] 🟥 Tap the widget → opens the "Received" screen

- [ ] 🟥 **Step 5: Install on both phones**
  - [ ] 🟥 Upload build to TestFlight, invite Ali and girlfriend by email
  - [ ] 🟥 One-page install guide for her: install TestFlight → open invite → pair → add widget

- [ ] 🟥 **Step 6: Verify end to end**
  - [ ] 🟥 Photo from Ali appears on her widget in under 10 s, and the reverse
  - [ ] 🟥 Works on mobile data, with the app closed, after a phone restart
