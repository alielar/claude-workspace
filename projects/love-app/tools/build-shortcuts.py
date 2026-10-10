"""Builds one signed 'Send to Love' shortcut per person into dist/ (git-ignored: it holds the key)."""
import os, plistlib, subprocess, sys, uuid

BASE = sys.argv[1]
env = dict(l.strip().split('=', 1) for l in open('.env') if '=' in l)
os.makedirs('dist', exist_ok=True)

def token(kind, **kw):
    return {'Value': {'Type': kind, **kw}, 'WFSerializationType': 'WFTextTokenAttachment'}

def shortcut(key):
    r, c, d = (str(uuid.uuid4()).upper() for _ in range(3))
    return {
        'WFWorkflowClientVersion': '2607.0.2',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59446},
        'WFWorkflowTypes': ['ActionExtension'],
        'WFWorkflowInputContentItemClasses': ['WFImageContentItem', 'WFPhotoMediaContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowImportQuestions': [],
        'WFQuickActionSurfaces': [],
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowActions': [
            {'WFWorkflowActionIdentifier': 'is.workflow.actions.image.resize',
             'WFWorkflowActionParameters': {'UUID': r, 'WFImage': token('ExtensionInput'),
                                            'WFImageResizeKey': 'Width', 'WFImageResizeWidth': '1600'}},
            {'WFWorkflowActionIdentifier': 'is.workflow.actions.image.convert',
             'WFWorkflowActionParameters': {'UUID': c, 'WFInput': token('ActionOutput', OutputUUID=r, OutputName='Resized Image'),
                                            'WFImageFormat': 'JPEG', 'WFImageCompressionQuality': 0.82,
                                            'WFImagePreserveMetadata': False}},
            {'WFWorkflowActionIdentifier': 'is.workflow.actions.downloadurl',
             'WFWorkflowActionParameters': {'UUID': d, 'WFURL': f'{BASE}/api/photo?k={key}', 'WFHTTPMethod': 'POST',
                                            'WFHTTPBodyType': 'File',
                                            'WFRequestVariable': token('ActionOutput', OutputUUID=c, OutputName='Converted Image')}},
            {'WFWorkflowActionIdentifier': 'is.workflow.actions.notification',
             'WFWorkflowActionParameters': {'WFNotificationActionTitle': 'Love', 'WFNotificationActionBody': 'Sent',
                                            'WFNotificationActionSound': False}},
        ],
    }

for who, key in (('ali', env['KEY_ALI']), ('her', env['KEY_HER'])):
    raw = f'dist/{who}-unsigned.shortcut'
    with open(raw, 'wb') as f:
        plistlib.dump(shortcut(key), f, fmt=plistlib.FMT_BINARY)
    out = f'dist/Send to Love ({who}).shortcut'
    subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', raw, '--output', out], check=True)
    os.remove(raw)
    print('signed', out, os.path.getsize(out), 'bytes')
