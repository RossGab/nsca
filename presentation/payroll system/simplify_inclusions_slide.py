from pathlib import Path
import zipfile
import re
import copy
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'payroll-proposal-v4.pptx'
OUTPUT=ROOT/'payroll-proposal-v5.pptx'
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
ET.register_namespace('p',P); ET.register_namespace('a',A)
ns={'p':P,'a':A}
groups=[
    ['Employee records & payroll — Maintain employee details and calculate semi-monthly pay.',
     'Contributions & tax — Calculate SSS, PhilHealth, Pag-IBIG and withholding tax.',
     'Attendance & leave — Record time-in/out, worked hours and leave for HR review.'],
    ['Driver-task earnings — Credit eligible completed tasks at agreed rates and prevent duplicate payments.',
     'Payslips & reports — Issue pay breakdowns, payroll summaries and task reconciliation.',
     'Setup & training — Configure and deploy the system, assist initial data setup and provide training and guides.']]
with zipfile.ZipFile(SOURCE) as archive:
    entries=[(info,archive.read(info.filename)) for info in archive.infolist()]
original=next(body.decode('utf-8') for info,body in entries if info.filename=='ppt/slides/slide15.xml')
def update(match):
    xml=match.group(0)
    shape=ET.fromstring(xml.replace('<p:sp>',f'<p:sp xmlns:p="{P}" xmlns:a="{A}">',1))
    values=' '.join(t.text or '' for t in shape.findall('.//a:t',ns))
    name=shape.find('.//p:cNvPr',ns).attrib.get('name','')
    if name=='Scope boundaries': return ''
    simple={'Included deliverables and exclusions':'System inclusions','INCLUDED DELIVERABLES':'PAYROLL & ATTENDANCE','EXCLUDED UNLESS AGREED':'EARNINGS, REPORTS & SETUP'}
    if values in simple:
        for t in shape.findall('.//a:t',ns): t.text=simple[values]
    elif 'Employee records; semi-monthly payroll' in values or 'Biometric hardware;' in values:
        group=groups[0] if 'Employee records;' in values else groups[1]
        body=shape.find('p:txBody',ns)
        base=body.find('a:p',ns)
        for para in list(body.findall('a:p',ns)): body.remove(para)
        for value in group:
            para=copy.deepcopy(base)
            runs=para.findall('a:r',ns)
            run=copy.deepcopy(runs[0])
            for old in list(para):
                if old.tag in (f'{{{A}}}r',f'{{{A}}}br',f'{{{A}}}fld'): para.remove(old)
            run.find('a:t',ns).text=value
            run.find('a:rPr',ns).set('sz','1700')
            para.append(run)
            spacing=para.find('a:pPr/a:spcAft/a:spcPts',ns)
            if spacing is not None: spacing.set('val','1000')
            body.append(para)
    else: return xml
    return ET.tostring(shape,encoding='unicode')
updated=re.sub(r'<p:sp>.*?</p:sp>',update,original,flags=re.S).encode('utf-8')
root=ET.fromstring(updated)
texts=' '.join(t.text or '' for t in root.iter(f'{{{A}}}t'))
assert 'EXCLUDED' not in texts and 'System inclusions' in texts
assert all(value in texts for group in groups for value in group)
with zipfile.ZipFile(OUTPUT,'w') as archive:
    for info,body in entries: archive.writestr(info,updated if info.filename=='ppt/slides/slide15.xml' else body)
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    for info,body in entries:
        if info.filename!='ppt/slides/slide15.xml': assert archive.read(info.filename)==body
print('Created payroll-proposal-v5.pptx: inclusions with six short definitions; all other slides unchanged.')
