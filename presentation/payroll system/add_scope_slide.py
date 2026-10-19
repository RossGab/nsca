"""Append the scope slide while preserving the customer's edited deck."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET
import re

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'payroll-proposal-v3.pptx'
OUTPUT=ROOT/'payroll-proposal-v4.pptx'
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
with zipfile.ZipFile(SOURCE) as archive:
    files={i.filename:(i,archive.read(i.filename)) for i in archive.infolist()}
slide=files['ppt/slides/slide6.xml'][1].decode('utf-8')
replacements={
    'What else is covered':'Included deliverables and exclusions',
    'IMPLEMENTATION':'INCLUDED DELIVERABLES',
    'Requirements and policy confirmation':'Employee records; semi-monthly payroll',
    'Configuration and initial data assistance':'SSS, PhilHealth, Pag-IBIG and tax',
    'Payroll and integration validation':'Attendance, leave and HR review',
    'Deployment, HR training and guides':'Task earnings, payslips and reports',
    'RECORDS &amp; CONTROLS':'EXCLUDED UNLESS AGREED',
    'Authorized user roles':'Biometric hardware; GPS / geofencing',
    'Audit history for payroll changes':'Bank integration; government submissions',
    'Protected finalized payroll records':'Historical cleanup; new integrations',
    'Task reconciliation and data exports':'Mobile apps; major enhancements',
    '<a:t>06</a:t>':'<a:t>15</a:t>',
}
for old,new in replacements.items():
    assert old in slide, old
    slide=slide.replace(old,new)
# Use existing editable text shape formatting for a scope clarification footer.
root=ET.fromstring(slide)
ns={'p':P,'a':A}
shapes=root.findall('.//p:spTree/p:sp',ns)
import copy
footer=copy.deepcopy(shapes[0])
sid=max(int(e.attrib['id']) for e in root.iter(f'{{{P}}}cNvPr'))+1
footer.find('.//p:cNvPr',ns).set('id',str(sid)); footer.find('.//p:cNvPr',ns).set('name','Scope boundaries')
transform=footer.find('.//a:xfrm',ns)
transform.find('a:off',ns).attrib.update(x='685800',y='5966460')
transform.find('a:ext',ns).attrib.update(cx='10789920',cy='320040')
texts=footer.findall('.//a:t',ns); texts[0].text='Deployment, training and documentation included. Import volume, sessions, reports and retainer limits agreed before launch.'
for t in texts[1:]: t.text=''
for prop in footer.findall('.//a:rPr',ns): prop.set('sz','1200')
# Insert new shape into the original XML to preserve PowerPoint namespace declarations.
ET.register_namespace('p',P); ET.register_namespace('a',A)
slide=slide.replace('</p:spTree>',ET.tostring(footer,encoding='unicode')+'</p:spTree>')
new_slide='ppt/slides/slide15.xml'
files[new_slide]=(None,slide.encode('utf-8'))
rels=ET.fromstring(files['ppt/slides/_rels/slide6.xml.rels'][1])
for rel in list(rels):
    if rel.attrib['Type'].endswith('/notesSlide'): rels.remove(rel)
files['ppt/slides/_rels/slide15.xml.rels']=(None,ET.tostring(rels,encoding='utf-8',xml_declaration=True))
presentation_rels=ET.fromstring(files['ppt/_rels/presentation.xml.rels'][1])
rid='rId'+str(max(int(e.attrib['Id'][3:]) for e in presentation_rels if re.fullmatch(r'rId\d+',e.attrib['Id']))+1)
ET.SubElement(presentation_rels,f'{{{REL}}}Relationship',Id=rid,Type=R+'/slide',Target='slides/slide15.xml')
files['ppt/_rels/presentation.xml.rels']=(None,ET.tostring(presentation_rels,encoding='utf-8',xml_declaration=True))
presentation=files['ppt/presentation.xml'][1].decode('utf-8')
ids=ET.fromstring(presentation).find(f'{{{P}}}sldIdLst')
next_id=max(int(e.attrib['id']) for e in ids)+1
presentation=presentation.replace('</p:sldIdLst>',f'<p:sldId id="{next_id}" r:id="{rid}"/></p:sldIdLst>')
files['ppt/presentation.xml']=(None,presentation.encode('utf-8'))
types=ET.fromstring(files['[Content_Types].xml'][1])
ET.SubElement(types,f'{{{CT}}}Override',PartName='/'+new_slide,ContentType='application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
files['[Content_Types].xml']=(None,ET.tostring(types,encoding='utf-8',xml_declaration=True))
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,(info,body) in files.items(): archive.writestr(info or name,body)
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    for name in archive.namelist():
        if name.endswith(('.xml','.rels')): ET.fromstring(archive.read(name))
    assert len(ET.fromstring(archive.read('ppt/presentation.xml')).find(f'{{{P}}}sldIdLst'))==15
print('Created payroll-proposal-v4.pptx with 15 slides; existing slides preserved and package XML verified.')
