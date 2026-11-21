from copy import deepcopy
from pathlib import Path
import posixpath, zipfile
import xml.etree.ElementTree as ET

SOURCE=Path('Report5_Unit Test.current.xlsm'); OUTPUT=Path('Report5_Unit Test.dash-type.xlsm')
M='http://schemas.openxmlformats.org/spreadsheetml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';N={'m':M,'r':R}
def put(root,a,v):
 c=next(x for x in root.findall('.//m:c',N) if x.get('r')==a)
 for x in list(c):c.remove(x)
 c.attrib['t']='inlineStr';i=ET.SubElement(c,f'{{{M}}}is');ET.SubElement(i,f'{{{M}}}t').text=v
with zipfile.ZipFile(SOURCE) as z:entries={x.filename:z.read(x.filename) for x in z.infolist()};infos={x.filename:x for x in z.infolist()}
w=ET.fromstring(entries['xl/workbook.xml']);rs=ET.fromstring(entries['xl/_rels/workbook.xml.rels']);p={x.get('Id'):x.get('Target') for x in rs};s=next(x for x in w.find('m:sheets',N) if x.get('name')=='DASH-EARN-01_projectEarnings');path=posixpath.normpath(posixpath.join('xl',p[s.get(f'{{{R}}}id')]));root=ET.fromstring(entries[path])
for i,t in enumerate('NNNAAAAAAN',5):put(root,f'{chr(64+i)}33',t)
entries[path]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as z:
 for k,v in entries.items():z.writestr(deepcopy(infos[k]),v)
