#!/usr/bin/env python3
"""
WhatsApp Feedback Campaign Generator
Grammar Platform — User Feedback Outreach

Usage:
    python3 generate_campaign.py

Output:
    whatsapp_campaign.txt  — 30 ready-to-send messages in 3 batches
    campaign_data.csv      — structured export for reference

CEFR Level mapping:
    Basic        → A0, A1, A2
    Intermediate → B1
    Advanced     → B2

Language detection:
    +39… → Italian messages
    +34… → Spanish messages

Selection: top 5 Italian + 5 Spanish per level, ranked by engagement
(Attendance + Feedbacks score), then lightly shuffled for variety.
"""

import csv
import os
import random

# ── CONFIG ─────────────────────────────────────────────────────────────────
RANDOM_SEED   = 42
IT_PER_LEVEL  = 5
ES_PER_LEVEL  = 5

LEVEL_MAP = {
    'A0': 'Basic',
    'A1': 'Basic',
    'A2': 'Basic',
    'B1': 'Intermediate',
    'B2': 'Advanced',
}

# ── MESSAGE TEMPLATES ───────────────────────────────────────────────────────
# One variant per level × 2 languages = 6 total templates
#
# Basic    → Focus on video comprehension (English-only), subtitle preference,
#            exercise quality
# Intermediate → Focus on lesson effectiveness, exercise difficulty, platform UX
# Advanced → Focus on content depth vs objectives, overall experience, gaps

TEMPLATES = {
    'Basic': {
        'IT': (
            "Ciao {name}! 👋 Ti scrivo dal team di Edusogno.\n\n"
            "Stiamo per lanciare una nuova piattaforma di grammatica inglese "
            "e prima del lancio vorremmo sentire il parere di qualche studente.\n\n"
            "Puoi darci un'occhiata qui: https://the-grammy.lovable.app\n\n"
            "Due domande veloci:\n"
            "1. I video in inglese ti risultano chiari e comprensibili, "
            "o pensi che i sottotitoli in italiano farebbero la differenza?\n"
            "2. Gli esercizi ti sembrano utili e al giusto livello di difficoltà?\n\n"
            "Rispondimi pure qui in poche righe, ci aiuta davvero tanto! 🙏"
        ),
        'ES': (
            "¡Hola {name}! 👋 Te escribo del equipo de easypeasyfluent.\n\n"
            "Estamos a punto de lanzar una nueva plataforma de gramática inglesa "
            "y antes del lanzamiento nos gustaría conocer la opinión de algunos estudiantes.\n\n"
            "Puedes echarle un vistazo aquí: https://the-grammy.lovable.app\n\n"
            "Dos preguntas rápidas:\n"
            "1. ¿Los vídeos en inglés te resultan claros y comprensibles, "
            "o crees que los subtítulos en español marcarían la diferencia?\n"
            "2. ¿Los ejercicios te parecen útiles y del nivel adecuado?\n\n"
            "¡Respóndeme aquí en pocas líneas, nos ayuda muchísimo! 🙏"
        ),
    },
    'Intermediate': {
        'IT': (
            "Ciao {name}! 👋 Ti scrivo dal team di Edusogno.\n\n"
            "Stiamo per lanciare una nuova piattaforma di grammatica inglese "
            "e prima del lancio vorremmo sentire il parere di qualche studente.\n\n"
            "Puoi darci un'occhiata qui: https://the-grammy.lovable.app\n\n"
            "Due domande veloci:\n"
            "1. Le lezioni video ti sembrano chiare e utili per il tuo livello?\n"
            "2. C'è qualcosa negli esercizi o nella piattaforma che cambieresti?\n\n"
            "Rispondimi pure qui quando hai un momento. Grazie! 🙏"
        ),
        'ES': (
            "¡Hola {name}! 👋 Te escribo del equipo de easypeasyfluent.\n\n"
            "Estamos a punto de lanzar una nueva plataforma de gramática inglesa "
            "y antes del lanzamiento nos gustaría conocer la opinión de algunos estudiantes.\n\n"
            "Puedes echarle un vistazo aquí: https://the-grammy.lovable.app\n\n"
            "Dos preguntas rápidas:\n"
            "1. ¿Las lecciones en vídeo te parecen claras y útiles para tu nivel?\n"
            "2. ¿Hay algo en los ejercicios o en la plataforma que cambiarías?\n\n"
            "¡Respóndeme aquí cuando tengas un momento. Gracias! 🙏"
        ),
    },
    'Advanced': {
        'IT': (
            "Ciao {name}! 👋 Ti scrivo dal team di Edusogno.\n\n"
            "Stiamo per lanciare una nuova piattaforma di grammatica inglese "
            "e prima del lancio vorremmo sentire il parere di qualche studente.\n\n"
            "Puoi darci un'occhiata qui: https://the-grammy.lovable.app\n\n"
            "Due domande veloci:\n"
            "1. Il contenuto delle lezioni ti sembra all'altezza per un livello avanzato? "
            "Manca qualcosa?\n"
            "2. Com'è la tua impressione generale sulla piattaforma e sugli esercizi?\n\n"
            "Anche due righe vanno benissimo, grazie mille per il tuo tempo! 🙏"
        ),
        'ES': (
            "¡Hola {name}! 👋 Te escribo del equipo de easypeasyfluent.\n\n"
            "Estamos a punto de lanzar una nueva plataforma de gramática inglesa "
            "y antes del lanzamiento nos gustaría conocer la opinión de algunos estudiantes.\n\n"
            "Puedes echarle un vistazo aquí: https://the-grammy.lovable.app\n\n"
            "Dos preguntas rápidas:\n"
            "1. ¿El contenido de las lecciones te parece adecuado para un nivel avanzado? "
            "¿Falta algo?\n"
            "2. ¿Cuál es tu impresión general de la plataforma y los ejercicios?\n\n"
            "¡Con dos líneas es suficiente, muchas gracias por tu tiempo! 🙏"
        ),
    },
}


# ── HELPERS ─────────────────────────────────────────────────────────────────

def detect_lang(phone: str) -> str | None:
    """Return 'IT' for Italian (+39), 'ES' for Spanish (+34), else None."""
    p = phone.strip().replace(' ', '')
    if p.startswith('+39'):
        return 'IT'
    if p.startswith('+34'):
        return 'ES'
    return None


def first_name(full_name: str) -> str:
    """Extract and capitalise the first word of a full name."""
    parts = full_name.strip().split()
    return parts[0].capitalize() if parts else 'there'


def engagement_score(row: dict) -> int:
    """Attendance + Feedbacks — higher means more active student."""
    def safe_int(val):
        try:
            return int(str(val).strip() or 0)
        except (ValueError, TypeError):
            return 0
    return safe_int(row.get('Attendance', 0)) + safe_int(row.get('Feedbacks', 0))


# ── CORE LOGIC ──────────────────────────────────────────────────────────────

def load_and_classify(csv_path: str) -> dict:
    """
    Read CSV and bucket students into:
        {level: {'IT': [rows], 'ES': [rows]}}
    Only keeps paid students with Italian or Spanish phone numbers.
    """
    pool = {
        'Basic':        {'IT': [], 'ES': []},
        'Intermediate': {'IT': [], 'ES': []},
        'Advanced':     {'IT': [], 'ES': []},
    }

    # Try UTF-8 first, fall back to latin-1 (covers most European encodings)
    for encoding in ('utf-8-sig', 'utf-8', 'latin-1'):
        try:
            with open(csv_path, newline='', encoding=encoding) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    paid = row.get('Paid', '').strip().upper()
                    if paid != 'YES':
                        continue

                    level_raw = row.get('English level', '').strip()
                    level = LEVEL_MAP.get(level_raw)
                    if not level:
                        continue

                    phone = row.get('Phone', '').strip()
                    lang  = detect_lang(phone)
                    if not lang:
                        continue

                    name = row.get('Name', '').strip()
                    if not name:
                        continue

                    pool[level][lang].append(row)
            break  # success
        except UnicodeDecodeError:
            continue

    return pool


def select_students(pool: dict) -> dict:
    """
    Per level: pick top IT_PER_LEVEL Italians + ES_PER_LEVEL Spaniards
    ranked by engagement score. If one nationality is short, fill from the other.
    Lightly shuffle the final batch so messages feel less predictable.
    """
    random.seed(RANDOM_SEED)
    selected = {}

    for level in ('Basic', 'Intermediate', 'Advanced'):
        it_sorted = sorted(pool[level]['IT'], key=engagement_score, reverse=True)
        es_sorted = sorted(pool[level]['ES'], key=engagement_score, reverse=True)

        it_pick = it_sorted[:IT_PER_LEVEL]
        es_pick = es_sorted[:ES_PER_LEVEL]

        # Fill shortfalls from the other nationality's overflow pool
        if len(it_pick) < IT_PER_LEVEL:
            needed  = IT_PER_LEVEL - len(it_pick)
            it_pick += es_sorted[ES_PER_LEVEL: ES_PER_LEVEL + needed]

        if len(es_pick) < ES_PER_LEVEL:
            needed  = ES_PER_LEVEL - len(es_pick)
            es_pick += it_sorted[IT_PER_LEVEL: IT_PER_LEVEL + needed]

        batch = it_pick + es_pick
        random.shuffle(batch)
        selected[level] = batch

    return selected


def build_message(row: dict, level: str) -> str:
    lang = detect_lang(row.get('Phone', ''))
    name = first_name(row.get('Name', ''))
    return TEMPLATES[level][lang].format(name=name)


# ── OUTPUT ──────────────────────────────────────────────────────────────────

def generate_txt(selected: dict) -> str:
    """Build the human-readable campaign file."""
    lines = []
    W = 68

    lines.append('=' * W)
    lines.append('  WHATSAPP FEEDBACK CAMPAIGN — Grammar Platform')
    lines.append('  3 batches × 10 messages  |  Send one batch per hour')
    lines.append('=' * W)

    for batch_num, level in enumerate(('Basic', 'Intermediate', 'Advanced'), 1):
        students = selected[level]
        lines.append(f'\n{"─" * W}')
        lines.append(f'  BATCH {batch_num} — {level.upper()}  ({len(students)} students)')
        if batch_num < 3:
            lines.append(f'  ⏰  After sending all messages in this batch, wait 1 hour')
        lines.append(f'{"─" * W}')

        for i, row in enumerate(students, 1):
            name  = row.get('Name', '').strip()
            phone = row.get('Phone', '').strip()
            eng   = row.get('English level', '').strip()
            lang  = detect_lang(phone)
            flag  = '🇮🇹 IT' if lang == 'IT' else '🇪🇸 ES'
            msg   = build_message(row, level)

            lines.append(f'\n[{i}/{len(students)}]  {name}')
            lines.append(f'     📱  {phone}   Level: {eng}   {flag}')
            lines.append('  ' + '─' * 44)
            # Indent the message body
            for line in msg.split('\n'):
                lines.append('  ' + line)

        lines.append('')

    lines.append('=' * W)
    lines.append('  END — 30 messages sent across 3 hourly batches')
    lines.append('=' * W)
    return '\n'.join(lines)


def generate_csv_export(selected: dict) -> list[dict]:
    """Return rows for the structured CSV export."""
    rows = []
    for batch_num, level in enumerate(('Basic', 'Intermediate', 'Advanced'), 1):
        for i, row in enumerate(selected[level], 1):
            lang = detect_lang(row.get('Phone', ''))
            rows.append({
                'Batch':    batch_num,
                'Order':    i,
                'Level':    level,
                'CEFR':     row.get('English level', ''),
                'Language': lang,
                'Name':     row.get('Name', ''),
                'Phone':    row.get('Phone', ''),
                'Message':  build_message(row, level),
            })
    return rows


# ── MAIN ────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path   = os.path.join(script_dir, 'All Users (51).csv')

    if not os.path.exists(csv_path):
        print(f'\n❌  CSV not found: {csv_path}')
        print('    Copy "All Users (51).csv" into this folder and re-run.\n')
        return

    print('📂  Loading students…')
    pool = load_and_classify(csv_path)

    # Print pool sizes for transparency
    for level in ('Basic', 'Intermediate', 'Advanced'):
        it = len(pool[level]['IT'])
        es = len(pool[level]['ES'])
        print(f'    {level}: {it} Italian paid  |  {es} Spanish paid')

    print('\n🎯  Selecting students…')
    selected = select_students(pool)

    for level in ('Basic', 'Intermediate', 'Advanced'):
        it_n = sum(1 for r in selected[level] if detect_lang(r.get('Phone','')) == 'IT')
        es_n = sum(1 for r in selected[level] if detect_lang(r.get('Phone','')) == 'ES')
        print(f'    {level}: {it_n} 🇮🇹  +  {es_n} 🇪🇸  = {it_n+es_n} total')

    print('\n✍️   Generating messages…')

    # Save human-readable campaign file
    txt_path = os.path.join(script_dir, 'whatsapp_campaign.txt')
    campaign_txt = generate_txt(selected)
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(campaign_txt)
    print(f'    📄  {txt_path}')

    # Save structured CSV export
    csv_export_path = os.path.join(script_dir, 'campaign_data.csv')
    export_rows = generate_csv_export(selected)
    with open(csv_export_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=export_rows[0].keys())
        writer.writeheader()
        writer.writerows(export_rows)
    print(f'    📊  {csv_export_path}')

    print('\n' + campaign_txt)
    print(f'\n✅  Done — {sum(len(v) for v in selected.values())} messages ready.')


if __name__ == '__main__':
    main()
