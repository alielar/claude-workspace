import json
from collections import Counter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

log = json.load(open('vocabulary_changes_log.json'))
orig = json.load(open('/Users/alielaraki/Downloads/Word Bank 3000.json'))
byid = {e['id']: e for e in orig}
tr = [c for c in log if c['field'] != 'definition']

def cat(c):
    i = c['issue'].lower()
    if ('two options' in i) or ('stray marks' in i) or ('extra word' in i): return 'slash'
    if any(x in i for x in ['capitalised', 'accent', 'typo', 'imperative', 'plural', 'feminine', 'base form', 'past participle']): return 'form'
    if 'noun' in i and 'verb' in i: return 'nounverb'
    if ('adjective' in i) or ('adverb' in i): return 'pos'
    if 'english word' in i: return 'english'
    return 'sense'

buckets = {}
for c in tr:
    buckets.setdefault(cat(c), []).append(c)

by_lang = Counter(c['language_code'] for c in tr)
by_conf = Counter(c['confidence'] for c in tr)

# ---------- styling ----------
NAVY = colors.HexColor('#1f3a5f')
LIGHT = colors.HexColor('#eef3f9')
GREY = colors.HexColor('#666666')
LINE = colors.HexColor('#cbd5e1')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TitleBig', parent=styles['Title'], fontSize=20, textColor=NAVY, spaceAfter=2, leading=24))
styles.add(ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, textColor=GREY, spaceAfter=2))
styles.add(ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=NAVY, spaceBefore=10, spaceAfter=4))
styles.add(ParagraphStyle('Body', parent=styles['Normal'], fontSize=9.5, leading=13, spaceAfter=4))
styles.add(ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=11, textColor=GREY))
styles.add(ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8.5, leading=11))
styles.add(ParagraphStyle('CellB', parent=styles['Normal'], fontSize=8.5, leading=11, textColor=colors.white))

story = []

def h2(t): story.append(Paragraph(t, styles['H2']))
def p(t): story.append(Paragraph(t, styles['Body']))
def sp(x=6): story.append(Spacer(1, x))

# ---------- title ----------
story.append(Paragraph('Word Bank 3000 &ndash; Correction Report', styles['TitleBig']))
story.append(Paragraph('Translations corrected across Spanish, German, French and Italian', styles['Sub']))
story.append(Paragraph('Prepared 28 July 2026', styles['Small']))
sp(10)

# ---------- headline numbers ----------
kstyle = ParagraphStyle('k', fontSize=8.5, textColor=GREY, alignment=1, leading=12)
def kpi_cell(num, label):
    return Paragraph('<font size=18 color="#1f3a5f"><b>%s</b></font><br/><br/>%s' % (num, label), kstyle)
kpi_data = [[kpi_cell('3,409', 'cards reviewed'),
             kpi_cell('969', 'translations fixed'),
             kpi_cell('658', 'words affected')]]
kpi = Table(kpi_data, colWidths=[54*mm]*3)
kpi.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), LIGHT),
    ('INNERGRID', (0,0), (-1,-1), 4, colors.white),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 12),
    ('BOTTOMPADDING', (0,0), (-1,-1), 12),
]))
story.append(kpi)
sp(8)

# ---------- overview ----------
p('Many English words carry several meanings, and the file sometimes gave a translation for the wrong '
  'one (for example "even" translated as "same" instead of "flat and level"). Every translation was '
  'checked against its own example sentence; only the ones that did not match the intended meaning were '
  'changed, and correct translations were left untouched. 969 fixes were made across 658 words, with 217 '
  'words needing a fix in more than one language.')

# ---------- error types ----------
h2('What was wrong')
labels = {
    'sense': 'Wrong meaning / false friend',
    'nounverb': 'Noun given where a verb was needed (or the reverse)',
    'pos': 'Wrong type of word (e.g. adjective for a noun)',
    'slash': 'Two options left in; the correct one was chosen',
    'form': 'Spelling, accent or capitalisation cleanup',
    'english': 'Translation left as the English word',
}
rows = [[Paragraph('<b>Type of error</b>', styles['CellB']), Paragraph('<b>Count</b>', styles['CellB'])]]
for k in ['sense', 'nounverb', 'pos', 'slash', 'form', 'english']:
    rows.append([Paragraph(labels[k], styles['Cell']), Paragraph(str(len(buckets.get(k, []))), styles['Cell'])])
t = Table(rows, colWidths=[140*mm, 28*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), NAVY),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
    ('LINEBELOW', (0,0), (-1,-1), 0.4, LINE),
    ('ALIGN', (1,0), (1,-1), 'CENTER'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
]))
story.append(t)
sp(8)

# ---------- language + confidence side by side ----------
lang_names = {'es': 'Spanish', 'de': 'German', 'fr': 'French', 'it': 'Italian'}
lrows = [[Paragraph('<b>Language</b>', styles['CellB']), Paragraph('<b>Fixes</b>', styles['CellB'])]]
for k in ['fr', 'de', 'it', 'es']:
    lrows.append([Paragraph(lang_names[k], styles['Cell']), Paragraph(str(by_lang[k]), styles['Cell'])])
ltab = Table(lrows, colWidths=[52*mm, 20*mm])

crows = [[Paragraph('<b>Confidence</b>', styles['CellB']), Paragraph('<b>Fixes</b>', styles['CellB'])]]
conf_lbl = {'high': 'High (clear-cut)', 'medium': 'Medium (close call)', 'low': 'Low (cosmetic)'}
for k in ['high', 'medium', 'low']:
    crows.append([Paragraph(conf_lbl[k], styles['Cell']), Paragraph(str(by_conf[k]), styles['Cell'])])
ctab = Table(crows, colWidths=[52*mm, 20*mm])

for tb in (ltab, ctab):
    tb.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ('LINEBELOW', (0,0), (-1,-1), 0.4, LINE),
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))

pair = Table([[ltab, '', ctab]], colWidths=[74*mm, 20*mm, 74*mm])
pair.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
story.append(pair)

doc = SimpleDocTemplate('Word_Bank_3000_Correction_Report.pdf', pagesize=A4,
                        leftMargin=20*mm, rightMargin=20*mm, topMargin=16*mm, bottomMargin=14*mm,
                        title='Word Bank 3000 Correction Report')
doc.build(story)
print('PDF written: Word_Bank_3000_Correction_Report.pdf')
