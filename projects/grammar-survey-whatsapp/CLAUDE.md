# Grammar Survey WhatsApp

## What this project does
WhatsApp outreach campaign to collect user feedback from 30 students (10 per CEFR level) of a grammar/English learning platform. Messages are personalized by first name, level, and language (Italian or Spanish).

## Stack
- Language: Python 3
- Key libraries: csv, os, random (all stdlib — no pip install needed)
- External services: WhatsApp (manual send from laptop app)

## Project structure
- `All Users (51).csv`        — raw student data (source of truth)
- `generate_campaign.py`      — main script: selects students, generates messages
- `whatsapp_campaign.txt`     — human-readable output: 30 messages in 3 batches
- `campaign_data.csv`         — structured export (Name, Phone, Message, Batch)

## Current status
- [x] Exploration done
- [x] Plan created
- [x] Implementation started
- [x] Code reviewed
- [ ] Messages sent

## Key decisions made
- CEFR mapping: Basic = A0/A1/A2 | Intermediate = B1 | Advanced = B2
- Language detection: +39 → Italian, +34 → Spanish (others excluded)
- Selection: top 5 IT + 5 ES per level ranked by Attendance + Feedbacks score
- Only Paid=YES students included
- One message template per level (not per individual) — keeps it manageable
- Basic template: focuses on video comprehension in English + subtitle preference
- Intermediate: lesson effectiveness + platform/exercise improvement
- Advanced: content depth vs objectives + overall experience
- Random seed 42 → reproducible selection across reruns

## Known issues / TODOs
- [ ] WhatsApp sending automation: currently manual. See README for options.
- [ ] Consider A/B testing two variants per level in a future run
