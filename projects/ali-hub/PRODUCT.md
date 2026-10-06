# A L I · product context

## Register
product

## Users
One user: Ali, a product person (not an engineer), on an iPhone 16 with the app installed from the home screen. Used every day, mostly one-handed, in short moments: on waking (routine, morning clock), on the floor during mobility, between tasks (to-do), on the sofa in the evening (news videos, football highlights), and after training (runs, strength, kettlebell). Also open on a laptop as a second screen.

## Product purpose
A private daily dashboard that makes the day's routine, to-dos, training, health and news one tap away, offline, instantly. The rebuild exists because the previous version was inconvenient (slow, not phone-shaped, useless offline, too many sections). Convenience first, features second: a feature that makes the phone slower is cut.

## Brand personality
Quiet morning. Calm, plain, confident. Says what a thing is and what to do, in a few words, never explains how the app works. The one place the app may shout is a timer or workout screen (big numerals). A tick is rewarded (chime, pop, strike) · nothing else celebrates.

## Anti-references
- Fitness and productivity apps that gamify everything (badges, confetti, streak nags on every screen).
- Dashboards that pile up metrics without a reading ("too many metrics, what do they imply").
- Settings pages that explain themselves in sentences.
- Generic SaaS card grids and hero-metric templates.
- Emojis as icons, em dashes anywhere, filler sentences, title-cased labels.

## Strategic design principles
1. Phone first, thumb-reachable, 44 px targets, single column; widen for the laptop after.
2. Local first: paint the saved copy instantly, refresh in the background; never a hanging spinner; skeletons or "—" while loading.
3. Five tabs (Today · To-do · R2-D2 · Other · Settings); everything else reached from inside.
4. Fixed rules over AI where a reading must stay the same every day (health, training insights, tips).
5. Sentence-case captions, system font, one accent, semantic pos / warn / neg; tokens only, no hard-coded colours.
6. Every write optimistic and idempotent; everything works offline except news.
7. Dark, light and a warm Night palette, automatic by the clock; manual choice holds.

## Redesign brief (2026-10-06)
Ali: "design-wise it still feels basic and flat · professional websites have interactivity, motion and polish · I want the hub to reach that level." The brand personality and anti-references above are still true for the CONTENT (plain words, no gamification, no metric piles); the visual restraint is no longer a principle. Both phone and laptop matter equally. References he named: Linear, Arc (open to better ones). The redesign covers the logic of each page too (objective, layout, end goal), decided in an interview before any build.
