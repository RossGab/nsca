"""Update proposal pricing while preserving the edited PowerPoint layout."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
replacements = {
    '₱350,000': '₱320,000',
    '₱280,000': '₱250,000',
    '₱40,000': '₱50,000',
    '₱105,000': '₱96,000',
    'The ₱10,000 deployment allocation is separate from the existing ₱10,000 retainer.':
        'Deployment, training and documentation are included. Existing retainer terms are separate.',
}
for filename in ('payroll-proposal.md', 'build_payroll_presentation.py'):
    path = ROOT / filename
    text = path.read_text(encoding='utf-8')
    for old,new in replacements.items(): text=text.replace(old,new)
    text=text.replace('| Deployment, training & documentation | ₱10,000 |', '| Deployment, training & documentation | Included |')
    text=text.replace("['Deployment, training & documentation','₱10,000']", "['Deployment, training & documentation','Included']")
    text=text.replace("['Deployment & final acceptance','10%','₱35,000']", "['Deployment & final acceptance','10%','₱32,000']")
    text=text.replace('| Production deployment and final acceptance | 10% | ₱35,000 |', '| Production deployment and final acceptance | 10% | ₱32,000 |')
    path.write_text(text,encoding='utf-8')

source=ROOT/'payroll-proposal-v2.pptx'
temporary=ROOT/'payroll-proposal-v2-pricing.tmp.pptx'
with zipfile.ZipFile(source) as archive:
    entries=[(info,archive.read(info.filename)) for info in archive.infolist()]
changed=[]
with zipfile.ZipFile(temporary,'w') as archive:
    for info,body in entries:
        if info.filename.startswith(('ppt/slides/', 'ppt/notesSlides/')) and info.filename.endswith('.xml'):
            text=body.decode('utf-8'); original=text
            for old,new in replacements.items(): text=text.replace(old,new)
            if 'TOTAL PROJECT PRICE' in text and 'Deployment, training' in text:
                text=text.replace('<a:t>₱10,000</a:t>','<a:t>Included</a:t>')
            if 'Delivery milestones for the one-time option' in text:
                text=text.replace('₱35,000','₱32,000')
            body=text.encode('utf-8')
            ET.fromstring(body)
            if text!=original: changed.append(info.filename)
        archive.writestr(info,body)
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    ns='{http://schemas.openxmlformats.org/drawingml/2006/main}'
    slides=[n for n in archive.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')]
    all_text='\n'.join(t.text or '' for n in slides for t in ET.fromstring(archive.read(n)).iter(ns+'t'))
    assert '₱350,000' not in all_text and '₱280,000' not in all_text and '₱105,000' not in all_text
    assert all(v in all_text for v in ('₱320,000','₱250,000','₱50,000','₱96,000','₱32,000','Included'))
    assert 250000+20000+50000==320000
    assert 96000*3+32000==320000
try:
    temporary.replace(source)
    output=source
except PermissionError:
    output=ROOT/'payroll-proposal-v3.pptx'
    temporary.replace(output)
print(f'Updated {output.name}; {len(changed)} slide/notes entries changed. Pricing and milestone totals validated.')
