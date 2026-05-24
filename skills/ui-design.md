# Design Philosophy

## Overview

This UI is designed with a focus on **clarity, accessibility, and user confidence**. The design balances a professional, structured layout with a modern, approachable aesthetic that reduces friction and encourages engagement.

---

## Visual Identity

### Color Palette

**Dark Theme Foundation**
- **Background**: Deep navy-to-purple gradient
  - Radial gradient from deep purple at the bottom-left corner
  - Radial gradient from dark teal at the bottom-right corner

**Surface Colors**
- **Card Surface (light)**: White (`#FFFFFF`) — used for primary action cards that need high visual prominence
- **Card Surface (muted)**: Highly transparent white (`rgba(255, 255, 255, 0.07)`) with `backdrop-filter: blur(16px)` — used for secondary informational panels; lets the background gradient show through clearly for depth
- **Card Surface (dark)**: Deep teal-slate (`#1E3A4A` range) — used for accent/highlight panels
- **Border (muted cards)**: Very subtle light border (`rgba(255,255,255,0.07)`) — gentle separation without harsh lines
- **Border (nav/general)**: `rgba(255,255,255,0.08)`

**Primary Colors**
- **Primary Accent**: Violet-purple (`#7C5CBF` / `hsl(265, 45%, 55%)`) — used for icon backgrounds, active nav states, and key UI markers
- **Primary Action (dark)**: Near-black (`#1A1A2E`) — used for high-emphasis buttons like Download
- **Destructive/Alert**: Coral-red (`#E87070`) — used for logout or warning actions
- **Foreground (on light)**: Dark charcoal (`#1A1A2E`) — high contrast text on white cards
- **Foreground (on dark)**: White (`#FFFFFF`) — readable text on dark/teal surfaces
- **Muted text (on dark)**: Light blue-gray (`#9BA8B8`) — supporting copy and labels on dark surfaces; bright enough to read clearly without competing with headings
- **Muted text (inline, on dark)**: `rgba(255,255,255,0.55–0.72)` range — used for supporting labels, timestamps, and secondary info within dark/muted cards

**Semantic Colors**
- **Warning/Deadline**: Red-orange (`#E05252`) — deadline labels and time-sensitive notices
- **Active Nav**: Purple (`#7C5CBF`) with white text — clearly indicates the current section

### Rationale
- **Dark gradient background** provides visual depth while keeping focus on card content
- **White cards on dark background** create strong contrast hierarchy, drawing the eye to primary actions
- **Highly transparent frosted cards** for secondary content let the gradient breathe through, creating a layered, glassy depth without hiding information. Opacity of `0.07` with `blur(16px)` is the sweet spot — present but not heavy
- **Muted text must stay readable**: Use `#9BA8B8` or `rgba(255,255,255,0.55+)` on dark surfaces — never go below `0.45` opacity for any user-facing text
- **Cool color palette** (purples, teals, navy) conveys professionalism and calmness
- **High contrast** between text and surfaces ensures accessibility (WCAG compliance)

---

## Typography & Spacing

**Font System**
- **Display / UI**: DM Sans — clean, geometric, modern; weights 400, 500, 600, 700
- **Monospace / Numbers**: DM Mono — used for scores, stats, and numeric data for clear tabular alignment
- Bold (`700`) for card headings and primary labels
- Medium (`500`) for nav items and supporting UI labels
- Regular (`400`) for body copy
- Consistent sizing hierarchy: large headings → medium labels → small supporting text

**Spacing**
- Base border radius: `1rem` (16px) for cards; `9999px` for pill-shaped nav items and buttons
- Cards use generous internal padding (`1.5rem–2rem`) for breathing room
- Gaps between cards: `1rem` vertically, `1rem` horizontally in grid layouts
- Icon containers: `44×44px` with rounded corners (`0.5rem` radius), purple-tinted background

---

## Component Design

### Navigation Bar
- **Style**: Horizontal pill-group nav, lightly bordered, sitting on a dark semi-transparent background (`rgba(13,15,30,0.82)`) with `backdrop-filter: blur(18px)`
- **Items**: Icon + label pairs, equal-width pill buttons
- **Active state**: Filled purple background with white text
- **Inactive state**: Transparent background, `rgba(255,255,255,0.65)` text, subtle border
- **Right side**: Separate action buttons (e.g. "Course guide", "Book 1:1 class") + icon-only notification button with coral dot indicator
- **Logo**: Small branded icon in a rounded square, left-anchored

### Cards

**Primary Cards (White)**
- Background: White
- Border: Light gray (`1px solid #E5E7EB`)
- Border radius: `1rem`
- Shadow: Subtle (`box-shadow: 0 2px 12px rgba(0,0,0,0.10)`)
- Layout: Horizontal — icon + text block on the left, action button on the right
- Icon: Small purple-background rounded square with a relevant glyph
- Heading: Bold, dark charcoal (`#1A1A2E`)
- Supporting text: Red/alert color for deadline notices; muted gray for standard copy
- Action button: Outlined (for low-emphasis) or filled dark (for high-emphasis like Download)
- **Use case**: Top-priority actions that require user attention

**Secondary Cards (Muted / Frosted)**
- Background: `rgba(255, 255, 255, 0.07)` — highly transparent, lets gradient show through
- Backdrop filter: `blur(16px)` — frosted glass effect
- Border: `1px solid rgba(255,255,255,0.07)` — barely-there edge definition
- Border radius: `1rem`
- Layout: Icon + heading + body copy at top; action buttons at the bottom
- Icon: Small purple-background rounded square
- Heading: Bold, white
- Body copy: `#9BA8B8` or `rgba(255,255,255,0.68)` — light enough to read easily
- Bottom actions: Row of outline pill buttons or a single "View" outline button
- **Use case**: Supporting actions or informational sections (support contact, contracts, activity feed)

**Accent Cards (Dark / Teal)**
- Background: Deep teal-to-slate gradient (`linear-gradient(160deg, #1E3A4A, #152B38)`)
- Text: White headings, `rgba(255,255,255,0.55)` for sub-labels
- Border radius: `1rem`
- Contains interactive inline elements (dropdowns, progress bars, stat chips)
- Bottom action: Full-width coral/red button for destructive or exit actions (e.g. Logout)
- **Use case**: Settings, language selection, account/identity panels

### Buttons

**Variants**
- **Filled Dark**: `#1A1A2E` background, white text — for primary high-emphasis actions
- **Outline (on light)**: Transparent background, `#D1D5DB` border, dark text, `border-radius: 9999px`
- **Outline (on dark)**: Transparent background, `rgba(255,255,255,0.25)` border, `rgba(255,255,255,0.85)` text
- **Filled Coral/Red**: `#E87070` background, white text — for destructive or exit actions
- **Nav Active**: Purple fill, white text, pill shape
- **Nav Inactive**: Transparent, `rgba(255,255,255,0.65)` text, subtle border

**Interaction Design**
- Smooth transitions for all state changes (`transition: opacity 0.2s, transform 0.15s`)
- Hover: `opacity: 0.9` + `translateY(-1px)` lift
- Focus ring visible for keyboard navigation
- Minimum button height: `44px` for touch accessibility
- Pill shape (`border-radius: 9999px`) used throughout for navigation and secondary buttons

### Icon Containers
- Size: `44×44px`
- Border radius: `0.5rem`
- Background: Purple-tinted (`rgba(124, 92, 191, 0.18)`)
- Icon color: Purple (`#7C5CBF`)
- Variant for teal accent: `rgba(91, 188, 208, 0.15)` background, `#5BBCD0` icon color
- Used consistently across all card types for visual anchoring

---

## Layout Principles

### Page Structure
- Full-viewport dark gradient background (no hard edges), `background-attachment: fixed`
- Sticky top navigation bar with blur backdrop
- Content area: padded container, centered, max-width `1160px`
- Staggered entrance animations (`slideUp`) with `animation-delay` per card

### Information Hierarchy
1. **Primary action cards** (white, top) — most urgent, most visible
2. **Secondary panel grid** (frosted/dark, middle) — supporting actions and settings
3. **Bottom panels** (frosted, bottom) — activity, documents, reference info
4. **Navigation** — always accessible, never intrusive

### Whitespace
- Generous padding inside cards prevents crowding
- Background gradient fills space between cards naturally
- Bottom of secondary cards uses internal spacing to push actions to the footer

### Visual Accessibility
- **High contrast** ratios meet WCAG AA standards
- **Muted text minimum**: `rgba(255,255,255,0.55)` on dark — never lower for readable copy
- **Color not sole indicator** — text labels and icons accompany all color-coded states
- **Focus indicators** visible for keyboard navigation
- **Readable font sizes**: minimum `0.78rem` for labels, `0.875rem` for body, `1rem`+ for headings

### Tailwind Token Reference

```
Colors:
  bg-base: #0D0F1E
  bg-gradient: purple-bottom-left (rgba 80,40,140,0.55) + teal-bottom-right (rgba 20,100,110,0.45)
  card-white: #FFFFFF
  card-muted: rgba(255,255,255,0.07) + backdrop-blur-16
  card-dark: #1E3A4A (gradient to #152B38)
  primary-accent: #7C5CBF
  primary-accent-light: rgba(124,92,191,0.18)
  btn-dark: #1A1A2E
  btn-coral: #E87070
  text-dark: #1A1A2E
  text-muted-dark: #9BA8B8
  text-muted-inline: rgba(255,255,255,0.55–0.72)
  text-alert: #E05252
  teal-accent: #5BBCD0

Border Radius:
  card: 1rem
  button-pill: 9999px
  icon-container: 0.5rem
  nav-item: 9999px

Spacing:
  card-padding: 1.5rem–2rem
  grid-gap: 1rem
  section-gap: 1rem
  max-content-width: 1160px

Typography:
  font-ui: 'DM Sans' (400, 500, 600, 700)
  font-mono: 'DM Mono' (400, 500) — for numeric/stat display
```

---

## Philosophy Summary

- **Clarity over decoration**: Every visual element has a purpose
- **Hierarchy through surface**: White cards demand attention; frosted cards support without competing; dark cards anchor settings
- **Transparency as depth**: Frosted muted cards at `rgba(255,255,255,0.07)` let the gradient breathe through, creating a layered, living background
- **Readable at all times**: Muted text must be light enough to read — `#9BA8B8` / `rgba(255,255,255,0.55+)` is the floor
- **Professional yet approachable**: Dark gradient + modern card components balance authority with warmth
- **Accessibility first**: Design decisions prioritize users with different abilities and contexts
- **Trust through consistency**: Predictable patterns, familiar components, and clear labeling build user confidence
