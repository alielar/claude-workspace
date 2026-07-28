import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak)

log = json.load(open('vocabulary_changes_log.json'))
orig = json.load(open('/Users/alielaraki/Downloads/Word Bank 3000.json'))
byid = {e['id']: e for e in orig}
tr = [c for c in log if c['field'] != 'definition']

lang_names = {'es': 'Spanish', 'de': 'German', 'fr': 'French', 'it': 'Italian'}

# sort inside each confidence group by numeric word id
def sort_key(c):
    return (int(c['word_id']), c['language_code'])

groups = {
    'low': sorted([c for c in tr if c['confidence'] == 'low'], key=sort_key),
    'medium': sorted([c for c in tr if c['confidence'] == 'medium'], key=sort_key),
    'high': sorted([c for c in tr if c['confidence'] == 'high'], key=sort_key),
}

# ---------- styling ----------
NAVY = colors.HexColor('#1f3a5f')
LIGHT = colors.HexColor('#eef3f9')
GREY = colors.HexColor('#666666')
LINE = colors.HexColor('#cbd5e1')
RED = colors.HexColor('#b42318')
GREEN = colors.HexColor('#15803d')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TitleBig', parent=styles['Title'], fontSize=20, textColor=NAVY, spaceAfter=2, leading=24))
styles.add(ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, textColor=GREY, spaceAfter=2))
styles.add(ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14, textColor=NAVY, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle('Body', parent=styles['Normal'], fontSize=9.5, leading=13, spaceAfter=4))
styles.add(ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=11, textColor=GREY))
styles.add(ParagraphStyle('Cell', parent=styles['Normal'], fontSize=7.5, leading=9.5))
styles.add(ParagraphStyle('CellB', parent=styles['Normal'], fontSize=7.5, leading=9.5, textColor=colors.white))
styles.add(ParagraphStyle('Was', parent=styles['Cell'], textColor=RED))
styles.add(ParagraphStyle('Now', parent=styles['Cell'], textColor=GREEN))
styles.add(ParagraphStyle('WordCell', parent=styles['Cell'], fontSize=8))

story = []

# ---------- cover ----------
story.append(Paragraph('Word Bank 3000 &ndash; Detailed Change Log', styles['TitleBig']))
story.append(Paragraph('Every translation correction, one by one, for line-by-line verification', styles['Sub']))
story.append(Paragraph('Prepared 28 July 2026', styles['Small']))
story.append(Spacer(1, 10))
story.append(Paragraph(
    'This report lists all 969 translation corrections. For each one you can see the word, the example '
    'sentence it appears in (which sets the intended meaning), the language, the value that was there before, '
    'the value it was changed to, and the reason. Changes are grouped by how confident the correction is, '
    'with the ones worth the closest look (Low, then Medium) shown first.', styles['Body']))
story.append(Paragraph(
    'Counts: <b>%d Low</b>, <b>%d Medium</b>, <b>%d High</b>  (total %d).' % (
        len(groups['low']), len(groups['medium']), len(groups['high']), len(tr)), styles['Body']))
story.append(PageBreak())

# ---------- table builder ----------
HEADER = [Paragraph('<b>#</b>', styles['CellB']),
          Paragraph('<b>Word</b>', styles['CellB']),
          Paragraph('<b>Example sentence (the sense being checked)</b>', styles['CellB']),
          Paragraph('<b>Lang</b>', styles['CellB']),
          Paragraph('<b>Before</b>', styles['CellB']),
          Paragraph('<b>After</b>', styles['CellB']),
          Paragraph('<b>Why it was changed</b>', styles['CellB'])]
COLW = [8*mm, 20*mm, 60*mm, 14*mm, 33*mm, 33*mm, 105*mm]

group_titles = {
    'low': 'Low-confidence changes &ndash; check these first',
    'medium': 'Medium-confidence changes',
    'high': 'High-confidence changes',
}
group_notes = {
    'low': 'Cosmetic or borderline. The old value was often already acceptable; the change is a small refinement or a judgement call.',
    'medium': 'The old value was in the right area but the wrong shade of meaning, or a close call between near-synonyms.',
    'high': 'Clear-cut: a plainly wrong word, a false friend, or a noun/verb swap.',
}

def build_group(key):
    items = groups[key]
    story.append(Paragraph(group_titles[key] + '  (%d)' % len(items), styles['H2']))
    story.append(Paragraph(group_notes[key], styles['Small']))
    story.append(Spacer(1, 4))
    rows = [HEADER]
    for n, c in enumerate(items, 1):
        ex = byid[c['word_id']].get('example', '') or ''
        rows.append([
            Paragraph(str(n), styles['Cell']),
            Paragraph('<b>%s</b>' % c['word'], styles['WordCell']),
            Paragraph(ex, styles['Cell']),
            Paragraph(lang_names[c['language_code']], styles['Cell']),
            Paragraph(c['old_value'], styles['Was']),
            Paragraph(c['new_value'], styles['Now']),
            Paragraph(c['issue'], styles['Cell']),
        ])
    t = Table(rows, colWidths=COLW, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, LINE),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4), ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t)
    story.append(PageBreak())

build_group('low')
build_group('medium')
build_group('high')

doc = SimpleDocTemplate('Word_Bank_3000_Detailed_Changes.pdf', pagesize=(A4[1], A4[0]),
                        leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm,
                        title='Word Bank 3000 Detailed Change Log')
doc.build(story)
print('PDF written: Word_Bank_3000_Detailed_Changes.pdf')
