"""Add Task Viewer to slide 1 without rebuilding user-edited slides."""
from pathlib import Path
from xml.sax.saxutils import escape
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'nsca-system-presentation-v2.pptx'
EMU = 914400
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'

def box(sid,x,y,w,h,value,size=12,fill=None,bold=False):
    paint=f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    line='<a:ln w="19050"><a:solidFill><a:srgbClr val="2583D8"/></a:solidFill></a:ln>' if fill else '<a:ln><a:noFill/></a:ln>'
    text=''.join(f'<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="{size*100}" b="{int(bold)}"><a:solidFill><a:srgbClr val="17283E"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>{escape(t)}</a:t></a:r><a:endParaRPr lang="en-US" sz="{size*100}"/></a:p>' for t in value.split('\n'))
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="Task Viewer {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{int(x*EMU)}" y="{int(y*EMU)}"/><a:ext cx="{int(w*EMU)}" cy="{int(h*EMU)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>{paint}{line}</p:spPr><p:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="45000" rIns="45000" tIns="25000" bIns="25000"><a:spAutoFit/></a:bodyPr><a:lstStyle/>{text}</p:txBody></p:sp>'

def line(sid,x1,y1,x2,y2,arrow=False):
    return f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{sid}" name="Task Viewer handoff {sid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm flipH="{int(x2<x1)}" flipV="{int(y2<y1)}"><a:off x="{int(min(x1,x2)*EMU)}" y="{int(min(y1,y2)*EMU)}"/><a:ext cx="{int(abs(x2-x1)*EMU)}" cy="{int(abs(y2-y1)*EMU)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="2583D8"/></a:solidFill>{"<a:tailEnd type='triangle'/>" if arrow else ""}</a:ln></p:spPr></p:cxnSp>'

with zipfile.ZipFile(SOURCE) as archive:
    entries=[(info,archive.read(info.filename)) for info in archive.infolist()]
original=dict((info.filename,body) for info,body in entries)
xml=original['ppt/slides/slide1.xml'].decode('utf-8')
if 'Task Viewer handoff' in xml:
    raise SystemExit('Task Viewer has already been added to slide 1.')
tree=ET.fromstring(xml)
sid=max(int(e.attrib['id']) for e in tree.iter(f'{{{P}}}cNvPr'))+1
parts=[]
def add(value):
    global sid
    parts.append(value); sid+=1
parts.append(box(sid,.65,1.32,11.5,.25,'TASK VIEWER FLOW — completed tasks within authorized BA access',11,bold=True)); sid+=1
for i,value in enumerate(['Sign in\nActive viewer account','Select assigned dates\nFrom / To range','Search and filter\nAllowed BA access','Review completed tasks\nDetails and photos']):
    x=.9+i*2.8
    add(box(sid,x,1.67,2.15,.58,value,12,'E7F3FB'))
    if i<3: add(line(sid,x+2.15,1.96,x+2.8,1.96,True))
# Connect successful driver uploads to Task Viewer review along the right margin.
add(line(sid,11.22,4.99,12.15,4.99))
add(line(sid,12.15,4.99,12.15,1.96))
add(line(sid,12.15,1.96,11.45,1.96,True))
add(box(sid,11.55,2.68,1.05,.82,'Uploaded\ncompleted\nrecords',10))
xml=xml.replace('High level Driver App and Admin Dashboard Flow','High level Driver, Admin and Task Viewer Flow')
xml=xml.replace('ADMIN &amp; DRIVER · HIGH-LEVEL FLOW','ADMIN, DRIVER &amp; TASK VIEWER · HIGH-LEVEL FLOW')
xml=xml.replace('</p:spTree>',''.join(parts)+'</p:spTree>')
updated=xml.encode('utf-8')
ET.fromstring(updated)
temporary=ROOT/'nsca-system-presentation-v2-updated.tmp.pptx'
with zipfile.ZipFile(temporary,'w') as archive:
    for info,body in entries:
        archive.writestr(info,updated if info.filename=='ppt/slides/slide1.xml' else body)
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    for name,body in original.items():
        if name!='ppt/slides/slide1.xml': assert archive.read(name)==body, name
    slide=ET.fromstring(archive.read('ppt/slides/slide1.xml'))
    ids=[e.attrib['id'] for e in slide.iter(f'{{{P}}}cNvPr')]
    assert len(ids)==len(set(ids))
try:
    temporary.replace(SOURCE)
    print('Updated nsca-system-presentation-v2.pptx: Task Viewer added to slide 1; all other package entries unchanged.')
except PermissionError:
    fallback=ROOT/'nsca-system-presentation-v2-taskviewer.pptx'
    temporary.replace(fallback)
    print(f'Original file is locked. Saved updated copy: {fallback.name}')
