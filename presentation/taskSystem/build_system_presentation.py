"""Build an editable PowerPoint using only Python's standard library."""
from pathlib import Path
from html.parser import HTMLParser
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
EMU = 914400
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

class Slides(HTMLParser):
    def __init__(self):
        super().__init__(); self.slides=[]; self.current=None; self.card=None; self.capture=None
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='section':
            self.current={'cards':[], 'lanes':[], 'heading':'', 'intro':'', 'notes':[]}; self.slides.append(self.current)
        if not self.current: return
        if tag=='article': self.card={'title':'','body':[]}; self.current['cards'].append(self.card)
        if tag=='img': self.current['svg']=attrs['src']
        cls=attrs.get('class','')
        if tag in ('h1','h2','h3','p') or cls in ('role','steps','strip','eyebrow'):
            self.capture=(tag, cls, [])
        if tag=='br' and self.capture: self.capture[2].append('\n')
    def handle_data(self,data):
        if self.capture: self.capture[2].append(data)
    def handle_endtag(self,tag):
        if self.capture and tag==self.capture[0]:
            kind,cls,parts=self.capture; value=''.join(parts).strip(); self.capture=None
            if kind in ('h1','h2'): self.current['heading']=value
            elif kind=='h3' and self.card: self.card['title']=value
            elif kind=='p' and self.card: self.card['body'].append(value)
            elif cls=='intro': self.current['intro']=value
            elif cls in ('role','steps'): self.current['lanes'].append(value)
            elif cls=='strip': self.current['strip']=value
            elif cls=='eyebrow': self.current['eyebrow']=value
            elif kind=='p': self.current['notes'].append(value)
        if tag=='article': self.card=None
        if tag=='section': self.current=None

def shape(sid,x,y,w,h,text='',size=18,fill=None,line=None,preset='rect',color='17283E',bold=False,center=False):
    geom=f'<a:prstGeom prst="{preset}"><a:avLst/></a:prstGeom>'
    style=(f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>')
    style+=f'<a:ln w="19050"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    paragraphs=''.join(f'<a:p><a:pPr algn="{"ctr" if center else "l"}"/><a:r><a:rPr lang="en-US" sz="{int(size*100)}" b="{int(bold)}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>{escape(t)}</a:t></a:r><a:endParaRPr lang="en-US" sz="{int(size*100)}"/></a:p>' for t in text.split('\n'))
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="Shape {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{int(x*EMU)}" y="{int(y*EMU)}"/><a:ext cx="{int(w*EMU)}" cy="{int(h*EMU)}"/></a:xfrm>{geom}{style}</p:spPr><p:txBody><a:bodyPr wrap="square" anchor="{"ctr" if center else "t"}" lIns="70000" rIns="70000" tIns="50000" bIns="50000"><a:spAutoFit/></a:bodyPr><a:lstStyle/>{paragraphs}</p:txBody></p:sp>'

def connector(sid,x1,y1,x2,y2,arrow=False,dashed=False):
    return f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{sid}" name="Connector {sid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm flipH="{int(x2<x1)}" flipV="{int(y2<y1)}"><a:off x="{int(min(x1,x2)*EMU)}" y="{int(min(y1,y2)*EMU)}"/><a:ext cx="{int(abs(x2-x1)*EMU)}" cy="{int(abs(y2-y1)*EMU)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="536B83"/></a:solidFill>{"<a:prstDash val='dash'/>" if dashed else ""}{"<a:tailEnd type='triangle'/>" if arrow else ""}</a:ln></p:spPr></p:cxnSp>'

def diagram(filename,start_id):
    root=ET.parse(ROOT/filename).getroot(); height=float(root.attrib['height']); scale=min(12.1/1200,5.7/height); ox=.6; oy=1.3; output=[]; sid=start_id
    def add(value):
        nonlocal sid
        output.append(value); sid+=1
    for e in root.iter():
        tag=e.tag.split('}')[-1]; attrs=e.attrib; cls=attrs.get('class','')
        if tag=='rect' and cls=='node' or tag=='rect' and cls in ('cloud','offline'):
            fill={'node':'FFFFFF','cloud':'E7F3FB','offline':'FFF3DF'}[cls]
            if 'fff3df' in attrs.get('style',''): fill='FFF3DF'
            if 'e7f3fb' in attrs.get('style',''): fill='E7F3FB'
            add(shape(sid,ox+float(attrs['x'])*scale,oy+float(attrs['y'])*scale,float(attrs['width'])*scale,float(attrs['height'])*scale,fill=fill,line='008B8B',preset='roundRect'))
        elif tag=='path' and cls=='':
            nums=[float(n) for n in re.findall(r'-?\d+(?:\.\d+)?',attrs.get('d',''))]
            if len(nums)==8:
                xs=nums[::2]; ys=nums[1::2]
                add(shape(sid,ox+min(xs)*scale,oy+min(ys)*scale,(max(xs)-min(xs))*scale,(max(ys)-min(ys))*scale,fill='E5F3F2',line='008B8B',preset='diamond'))
        elif tag=='path' and 'edge' in cls:
            tokens=re.findall(r'[MHV]|-?\d+(?:\.\d+)?',attrs['d']); points=[]; i=0; mode=None
            while i<len(tokens):
                if tokens[i] in ('M','H','V'): mode=tokens[i]; i+=1
                if mode=='M': points.append((float(tokens[i]),float(tokens[i+1]))); i+=2
                elif mode=='H': points.append((float(tokens[i]),points[-1][1])); i+=1
                elif mode=='V': points.append((points[-1][0],float(tokens[i]))); i+=1
            for j,(first,last) in enumerate(zip(points,points[1:])):
                add(connector(sid,ox+first[0]*scale,oy+first[1]*scale,ox+last[0]*scale,oy+last[1]*scale,j==len(points)-2,'retry' in cls or 'dash' in attrs.get('style','')))
        elif tag=='text':
            # Main heading is supplied by the slide title; preserve all graph labels.
            if float(attrs['y'])<90: continue
            x=float(attrs['x']); y=float(attrs['y']); value=''.join(e.itertext()); small=cls in ('small','label'); font=(14 if cls=='small' else 13 if cls=='label' else 18)*scale*72
            width=3.8 if len(value)>32 else 2.6
            add(shape(sid,ox+x*scale-width/2,oy+y*scale-.19,width,.38,value,font,color='007E80' if cls=='label' else '17283E',bold=cls=='label',center=True))
    return output

parser=Slides(); parser.feed((ROOT/'system-flow-presentation.html').read_text(encoding='utf-8'))
slides=[]
for number,data in enumerate(parser.slides,1):
    parts=[]; sid=2
    def add(x,y,w,h,value='',size=18,**kw):
        global sid
        parts.append(shape(sid,x,y,w,h,value,size,**kw)); sid+=1
    add(.6,.25,12,.3,data.get('eyebrow','NSCA'),11,color='007E80',bold=True)
    add(.6,.7,12.1,.6,data['heading'],29,bold=True)
    if 'svg' in data: parts.extend(diagram(data['svg'],sid))
    else:
        add(.6,1.42,12.1,.65,data['intro'],17,color='526278')
        cards=data['cards']
        if cards:
            cols=3 if len(cards)>=3 else 2; rows=(len(cards)+cols-1)//cols; gap=.22; width=(12.1-(cols-1)*gap)/cols; height=3.8 if rows==1 else 1.92
            for i,card in enumerate(cards):
                x=.6+(i%cols)*(width+gap); y=2.23+(i//cols)*(height+.2)
                add(x,y,width,height,fill='FFFFFF',line='D6E0EC',preset='roundRect')
                add(x+.15,y+.14,width-.3,.5,card['title'],20,bold=True,color='007E80')
                add(x+.15,y+.73,width-.3,height-.84,'\n'.join(card['body']),14 if rows==1 else 16,color='526278')
        elif data['lanes']:
            for i in range(0,len(data['lanes']),2):
                y=2.25+i/2*.9
                add(.6,y,1.8,.7,data['lanes'][i],18,bold=True,color='007E80')
                add(2.5,y,10.2,.75,data['lanes'][i+1],17,fill='FFFFFF')
        if number==3:
            notes=[n for n in data['notes'] if not n.startswith('3 /')]
            add(.6,4.55,12.1,1.55,'\n'.join(notes),16,color='526278')
        strip=data.get('strip','')
        if strip: add(.6,6.48,12.1,.56,strip.replace('\n','  |  '),16,fill='172E4B',color='FFFFFF',preset='roundRect')
    add(.6,7.12,11.5,.22,'NSCA · Task Administration · System & Driver App',10,color='607087')
    add(12.1,7.1,.65,.25,f'{number} / {len(parser.slides)}',10,color='607087')
    tree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    slides.append(f'<p:sld xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F8FC"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{tree}{"".join(parts)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')

def relationships(entries):
    return f'<Relationships xmlns="{REL}">'+''.join(f'<Relationship Id="{rid}" Type="{R}/{kind}" Target="{target}"/>' for rid,kind,target in entries)+'</Relationships>'

files={}
with zipfile.ZipFile(ROOT.parent/'payroll system'/'payroll-proposal.pptx') as template:
    for name in template.namelist():
        if name.startswith(('ppt/slideMasters/','ppt/slideLayouts/','ppt/theme/')): files[name]=template.read(name)
    old_types=ET.fromstring(template.read('[Content_Types].xml'))
files['_rels/.rels']=relationships([('rId1','officeDocument','ppt/presentation.xml')])
files['ppt/presentation.xml']=f'<p:presentation xmlns:p="{P}" xmlns:r="{R}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+''.join(f'<p:sldId id="{255+i}" r:id="rId{i+1}"/>' for i in range(1,len(slides)+1))+f'</p:sldIdLst><p:sldSz cx="{int(13.333*EMU)}" cy="{int(7.5*EMU)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
files['ppt/_rels/presentation.xml.rels']=relationships([('rId1','slideMaster','slideMasters/slideMaster1.xml')]+[(f'rId{i+1}','slide',f'slides/slide{i}.xml') for i in range(1,len(slides)+1)])
for i,xml in enumerate(slides,1):
    files[f'ppt/slides/slide{i}.xml']=xml
    files[f'ppt/slides/_rels/slide{i}.xml.rels']=relationships([('rId1','slideLayout','../slideLayouts/slideLayout7.xml')])
types=['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>','<Default Extension="xml" ContentType="application/xml"/>']
for element in old_types:
    name=element.attrib.get('PartName','').lstrip('/')
    if name in files: types.append(f'<Override PartName="/{name}" ContentType="{element.attrib["ContentType"]}"/>')
files['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+''.join(types)+'</Types>'
output=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'nsca-system-presentation.pptx')
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,content in files.items(): archive.writestr(name,content)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name in archive.namelist():
        if name.endswith(('.xml','.rels')): ET.fromstring(archive.read(name))
    import posixpath
    for name in archive.namelist():
        if name.endswith('.rels'):
            base=posixpath.dirname(posixpath.dirname(name)) if name!='_rels/.rels' else ''
            for rel in ET.fromstring(archive.read(name)):
                if rel.attrib.get('TargetMode')=='External': continue
                target=posixpath.normpath(posixpath.join(base,rel.attrib['Target']))
                assert target in files, (name,target)
print(f'Created {output.name}: {len(slides)} editable slides; XML and package relationships validated.')
