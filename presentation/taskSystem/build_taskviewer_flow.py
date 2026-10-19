from pathlib import Path
from html import escape

root = Path(__file__).resolve().parent
parts = ['''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650" role="img" aria-labelledby="title desc">
<title id="title">How completed tasks become viewable in Task Viewer</title>
<desc id="desc">Successful completion uploads create shared completed records. The user signs in with an active authorized account, selects assigned dates, and loads completed records from saved snapshots and Firestore. Records are merged, restricted by configured BA and user BA access, then searched and displayed. Users open task details and load photos.</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#536b83"/></marker></defs>
<style>text{font-family:Arial,sans-serif;fill:#17283e;text-anchor:middle;font-size:18px}.small{font-size:14px;fill:#526278}.label{font-size:13px;font-weight:bold;fill:#007e80}.node{fill:white;stroke:#008b8b;stroke-width:2;rx:12}.cloud{fill:#e7f3fb;stroke:#2583d8;stroke-width:2;rx:12}.edge{fill:none;stroke:#536b83;stroke-width:2;marker-end:url(#arrow)}</style>
<rect width="1200" height="650" rx="16" fill="#f5f8fc"/>
<text x="35" y="42" style="text-anchor:start;font-size:28px;font-weight:bold">Task Viewer — From Completed Work to Visible Records</text>
<text x="35" y="70" class="small" style="text-anchor:start">Completed cloud records + authorized BA access + selected assigned dates</text>''']
def text(x,y,value,cls=''):
    parts.append(f'<text x="{x}" y="{y}" class="{cls}">{escape(value)}</text>')
def node(x,y,title,body,cloud=False):
    cls='cloud' if cloud else 'node'
    parts.append(f'<rect class="{cls}" x="{x}" y="{y}" width="230" height="80"/>')
    text(x+115,y+31,title); text(x+115,y+57,body,'small')
def edge(path,dashed=False):
    parts.append(f'<path class="edge" d="{path}"'+(' style="stroke-dasharray:6 4"' if dashed else '')+'/>')
node(35,110,'Driver uploads completion','Details and supporting photos')
node(335,110,'Shared completed records','Cloud status: COMPLETED',True)
node(635,110,'User signs in','Registered email and password')
node(935,110,'Verify viewer access','Active role + assigned BA access')
edge('M265 150H335'); edge('M865 150H935')
node(635,280,'Select From / To dates','Retrieve by assigned task date')
edge('M1050 190V235H750V280')
node(35,280,'Saved task snapshots','Cache first; check for updates',True)
node(335,280,'Read completed tasks','Firestore within allowed BAs',True)
edge('M450 190V280')
edge('M635 320H565')
edge('M750 280V250H150V280')
text(470,236,'Selected date range','small')
node(35,460,'Combine task records','Merge snapshots and live records')
node(335,460,'Apply access and filters','Configured BA, user BA, search')
node(635,460,'Display matching tasks','Task cards with Prev / Next pages')
node(935,460,'Review details and photos','Expand header → Load Photos')
edge('M150 360V460'); edge('M450 360V411H150V460')
edge('M265 500H335'); edge('M565 500H635'); edge('M865 500H935')
text(915,380,'Not authorized → access denied','small')
text(915,405,'No matching records → No tasks found','small')
text(600,590,'Visible task = completed record in the chosen date range + allowed BA + matching filters','label')
text(600,618,'Work saved only on the driver device still needs a successful upload to become a shared completion.','small')
parts.append('</svg>')
(root/'taskviewer-flow.svg').write_text('\n'.join(parts),encoding='utf-8')
