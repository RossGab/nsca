from pathlib import Path
from html import escape

root = Path(__file__).resolve().parent
parts = ['''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620" role="img" aria-labelledby="title desc">
<title id="title">High-level Admin and Driver flow</title>
<desc id="desc">Admin imports, assigns, monitors, and reviews tasks. Drivers download, visit, record, and sync work. Assignments pass to drivers; GPS activity and successfully uploaded results pass to administrators. Offline or failed uploads are retained for retry.</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#536b83"/></marker></defs>
<style>text{font-family:Arial,sans-serif;fill:#17283e;text-anchor:middle;font-size:18px}.small{font-size:14px;fill:#526278}.label{font-size:13px;font-weight:bold;fill:#007e80}.node{fill:white;stroke:#008b8b;stroke-width:2;rx:12}.edge{fill:none;stroke:#536b83;stroke-width:2;marker-end:url(#arrow)}</style>
<rect width="1200" height="620" rx="16" fill="#f5f8fc"/>
<text x="35" y="43" style="text-anchor:start;font-size:28px;font-weight:bold">Admin + Driver — High-Level Flow</text>
<text x="35" y="72" class="small" style="text-anchor:start">Two roles working together through shared task records</text>''']
def text(x, y, value, cls=''):
    parts.append(f'<text x="{x}" y="{y}" class="{cls}">{escape(value)}</text>')
def edge(path, dashed=False):
    parts.append(f'<path class="edge" d="{path}"'+(' style="stroke-dasharray:6 4"' if dashed else '')+'/>')
for y, role, items in [
    (130, 'ADMIN FLOW', [('Import tasks','Customer, location, and job details'), ('Assign drivers','Distribute the workload'), ('Monitor operations','Live map, graphs, and heatmap'), ('Review and report','Evidence, results, and exports')]),
    (360, 'DRIVER FLOW', [('Download assignments','Select driver ID and date'), ('Find and visit tasks','Search, QR, task map, and GPS'), ('Record and save work','Outcome and photos on device'), ('Sync completed work','Upload results and photos')])]:
    text(145, y-22, role, 'label')
    for i, (title, body) in enumerate(items):
        x=35+i*300
        parts.append(f'<rect class="node" x="{x}" y="{y}" width="220" height="85"/>')
        text(x+110,y+32,title); text(x+110,y+58,body,'small')
        if i<3: edge(f'M{x+220} {y+42}H{x+300}')
edge('M445 215V255H145V360'); text(250,244,'Assigned tasks','small')
edge('M445 360V295H745V215',True); text(595,282,'GPS / activity updates when available','small')
edge('M1155 402H1180V172H1155'); text(1045,320,'Successful upload → admin review','small')
parts.append('<rect class="node" x="425" y="510" width="535" height="72" style="fill:#fff3df;stroke:#d18a23"/>')
text(692,538,'Offline or upload failed: keep work on device'); text(692,565,'Reconnect and retry until successfully transferred','small')
edge('M1045 445V546H960'); edge('M960 568H1165V470H1045V445',True)
text(220,545,'Shared records connect both roles.','small'); text(220,570,'Admin follow-up guides the next workload.','small')
parts.append('</svg>')
(root/'admin-driver-high-level-flow.svg').write_text('\n'.join(parts),encoding='utf-8')
