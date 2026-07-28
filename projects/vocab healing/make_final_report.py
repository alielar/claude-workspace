import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak)

data = json.load(open('vocabulary_adjusted_with_notes.json'))

NAVY = colors.HexColor('#1f3a5f')
LIGHT = colors.HexColor('#eef3f9')
GREY = colors.HexColor('#666666')
LINE = colors.HexColor('#cbd5e1')
RED = colors.HexColor('#b42318')
GREEN = colors.HexColor('#15803d')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TitleBig', parent=styles['Title'], fontSize=20,
                          textColor=NAVY, spaceAfter=2, leading=24))
styles.add(ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10,
                          textColor=GREY, spaceAfter=2))
styles.add(ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14,
                          textColor=NAVY, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle('Body', parent=styles['Normal'], fontSize=9.5,
                          leading=13, spaceAfter=4))
styles.add(ParagraphStyle('Small', parent=styles['Normal'], fontSize=8,
                          leading=11, textColor=GREY))
styles.add(ParagraphStyle('Cell', parent=styles['Normal'], fontSize=7.5, leading=9.5))
styles.add(ParagraphStyle('CellB', parent=styles['Normal'], fontSize=7.5,
                          leading=9.5, textColor=colors.white))
styles.add(ParagraphStyle('Was', parent=styles['Cell'], textColor=RED))
styles.add(ParagraphStyle('Now', parent=styles['Cell'], textColor=GREEN))
styles.add(ParagraphStyle('WordCell', parent=styles['Cell'], fontSize=8.5))


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def trline(t):
    return 'ES %s<br/>DE %s<br/>FR %s<br/>IT %s' % (
        esc(t.get('es', '')), esc(t.get('de', '')),
        esc(t.get('fr', '')), esc(t.get('it', '')))


story = []
story.append(Paragraph('Word Bank 3000 &ndash; Second-Pass Corrections', styles['TitleBig']))
story.append(Paragraph('Entries rebuilt around the first meaning of the English word', styles['Sub']))
story.append(Paragraph('Prepared 28 July 2026', styles['Small']))
story.append(Spacer(1, 10))
story.append(Paragraph(
    'All 969 changes from the first pass were reviewed. The problem found again and again was that '
    'the earlier pass took whatever the example sentence happened to mean and then rewrote all four '
    'translations to fit it. Where the example showed a rare use of a word, the whole entry drifted away '
    'from the meaning a learner actually reaches for first &ndash; the same way "holiday" drifted from '
    '<i>vacances</i> to <i>jour f&eacute;ri&eacute;</i>.', styles['Body']))
story.append(Paragraph(
    'This report lists the <b>%d entries that were adjusted</b>. For each one you see the definition, '
    'example and all four translations exactly as they were before, exactly as they are now, and a plain '
    'explanation of why. Everything not listed here was left untouched.' % len(data), styles['Body']))
story.append(Paragraph(
    'The matching file <b>vocabulary_adjusted.json</b> holds the same %d entries in the original list '
    'format, ready to drop back in.' % len(data), styles['Body']))
story.append(Spacer(1, 8))
story.append(Paragraph('What was fixed, and how often', styles['H2']))
story.append(Paragraph(
    '&bull; <b>Wrong meaning taught.</b> Words such as <i>light</i>, <i>post</i>, <i>bar</i>, <i>bear</i>, '
    '<i>stick</i>, <i>shot</i>, <i>champion</i>, <i>appropriate</i> and <i>web</i> had been moved onto a rare '
    'second meaning. Every one was put back to the meaning a learner meets first.<br/>'
    '&bull; <b>Definition, example and translations disagreeing.</b> Fixed so all three tell the same story.<br/>'
    '&bull; <b>Broken example sentences</b> with repeated or missing words. Rewritten.<br/>'
    '&bull; <b>False friends</b> such as Spanish <i>asistir</i>, French <i>pr&eacute;tendre</i> and Italian '
    '<i>possibilmente</i>. Replaced.<br/>'
    '&bull; <b>The four languages not matching in shape</b> &ndash; one a noun, another a verb, another a phrase. '
    'Made parallel.<br/>'
    '&bull; <b>Regional and spelling problems</b>: Latin-American-only words, missing accents, old German '
    'spellings, stray capital letters.<br/>'
    '&bull; <b>Repeated words in the list</b> given matching entries, or split cleanly into two different '
    'meanings where that was more useful.', styles['Body']))
story.append(PageBreak())

HEADER = [Paragraph('<b>#</b>', styles['CellB']),
          Paragraph('<b>Word</b>', styles['CellB']),
          Paragraph('<b>Before</b>', styles['CellB']),
          Paragraph('<b>After</b>', styles['CellB']),
          Paragraph('<b>Why it was changed</b>', styles['CellB'])]
COLW = [8*mm, 22*mm, 84*mm, 84*mm, 75*mm]

rows = [HEADER]
for n, e in enumerate(data, 1):
    b = e['_before']
    before = '<b>Def:</b> %s<br/><b>Ex:</b> %s<br/>%s' % (
        esc(b['definition']), esc(b['example']), trline(b['translations']))
    after = '<b>Def:</b> %s<br/><b>Ex:</b> %s<br/>%s' % (
        esc(e['definition']), esc(e['example']), trline(e['translations']))
    rows.append([
        Paragraph(str(n), styles['Cell']),
        Paragraph('<b>%s</b><br/><font size=6 color="#666666">id %s</font>'
                  % (esc(e['word']), e['id']), styles['WordCell']),
        Paragraph(before, styles['Was']),
        Paragraph(after, styles['Now']),
        Paragraph(esc(e['_note']), styles['Cell']),
    ])

t = Table(rows, colWidths=COLW, repeatRows=1)
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), NAVY),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
    ('LINEBELOW', (0, 0), (-1, -1), 0.3, LINE),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
]))
story.append(t)

doc = SimpleDocTemplate('Word_Bank_3000_Second_Pass.pdf', pagesize=(A4[1], A4[0]),
                        leftMargin=12*mm, rightMargin=12*mm,
                        topMargin=12*mm, bottomMargin=12*mm,
                        title='Word Bank 3000 Second-Pass Corrections')
doc.build(story)
print('PDF written: Word_Bank_3000_Second_Pass.pdf (%d entries)' % len(data))
