from copy import deepcopy
from pathlib import Path
import posixpath, re, zipfile
import xml.etree.ElementTree as ET

SOURCE=Path('Report5_Unit Test.current.xlsm'); OUTPUT=Path('Report5_Unit Test.remaining-template.xlsm')
M='http://schemas.openxmlformats.org/spreadsheetml/2006/main'; R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'; N={'m':M,'r':R}
TEMPLATE='FE-PAGE-DTO-01_readPagination'
CFG={
'DASH-EARN-01_projectEarnings':('DASH-EARN-01','projectEarnings',28,6,'NNNAAAAAAN',[
 ('reconciled owner-scoped booking', [1]),('bookingState = CANCELLED',[2]),('sitterId differs from actor',[3]),('available balance breaks reconciliation',[4]),('paid > 0 without transfer evidence',[5]),('explanation is empty',[6]),('bookingState = ASSIGNED',[7]),('duplicate booking resource',[8]),('paid > 0 with no transferRecordedAt',[9]),('transferRecordedAt is valid UTC instant',[10])],{3,4,5,6,7,8,9}),
'PAGE-01_paginate':('PAGE-01','paginate',10,6,'NNNA',[
 ('filter = { state: ACTIVE }',[1]),('sort = { id: 1 }',[1]),('page = 2 and limit = 20',[1]),('page is past final item',[2]),('countDocuments throws Error(count failed)',[3]),('collation = { locale: vi }',[4])],{3}),
'PAGE-IN-01_parsePageQuery':('PAGE-IN-01','parsePageQuery',14,7,'NBAAAAAAAABNN',[
 ('page and limit are missing',[1]),('page = 100000 (maximum)',[2]),('page = 0',[3]),('page = 1.5',[4]),('page = number 1',[5]),('page = null',[6]),('limit = 0',[7]),('limit = 51',[8]),("limit = ' 1'",[9]),('limit = boolean true',[10]),('custom defaultLimit = 10 and maxLimit = 25',[11]),('page = undefined',[12]),('limit = undefined',[13])],{3,4,5,6,7,8,9,10})}
def col(n):
 s=''
 while n:n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def path_for(wb,paths,name):
 sh=next(x for x in wb.find('m:sheets',N) if x.get('name')==name);return posixpath.normpath(posixpath.join('xl',paths[sh.get(f'{{{R}}}id')]))
def put(root,a,v):
 c=next((x for x in root.findall('.//m:c',N) if x.get('r')==a),None)
 if c is None:
  row=re.search(r'\d+',a).group();p=next(x for x in root.find('m:sheetData',N) if x.get('r')==row);c=ET.SubElement(p,f'{{{M}}}c',{'r':a})
 for x in list(c):c.remove(x)
 c.attrib.pop('t',None)
 if isinstance(v,(int,float)):ET.SubElement(c,f'{{{M}}}v').text=str(v)
 else:c.attrib['t']='inlineStr';i=ET.SubElement(c,f'{{{M}}}is');ET.SubElement(i,f'{{{M}}}t').text=v
def mark(root,row,ids):
 for n in ids:put(root,f'{col(4+n)}{row}','O')
def shift_ref(value,at):
 def sub(m):return m.group(1)+str(int(m.group(2))+(1 if int(m.group(2))>=at else 0))
 return re.sub(r'([A-Z]+)(\d+)',sub,value)
def insert_condition_row(root):
 data=root.find('m:sheetData',N)
 for row in reversed(list(data)):
  if int(row.get('r'))>=23:
   row.set('r',str(int(row.get('r'))+1))
   for c in row.findall('m:c',N):c.set('r',shift_ref(c.get('r'),23))
 sample=next(x for x in data if x.get('r')=='22');new=deepcopy(sample);new.set('r','23')
 for c in new.findall('m:c',N):c.set('r',shift_ref(c.get('r'),23))
 data.insert(list(data).index(sample)+1,new)
 for merge in root.findall('.//m:mergeCell',N):merge.set('ref',shift_ref(merge.get('ref'),23))
def fill(root,name,cfg):
 code,func,loc,lack,types,conditions,throws=cfg; extra=len(conditions)-12
 if extra:insert_condition_row(root)
 off=extra
 for a,v in {'C2':code,'K2':func,'C3':'DatDT','K3':'Jest','C4':loc,'K4':lack,'C5':f'Unit test matrix for {func}.','A7':len(types),'C7':0,'E7':0,'K7':types.count('N'),'L7':types.count('A'),'M7':types.count('B'),'N7':len(types),'E10':'Mocked unit fixtures; no database or external provider.'}.items():put(root,a,v)
 for r in range(11,23+off):
  put(root,f'B{r}','')
  for n in range(1,13):put(root,f'{col(4+n)}{r}','')
 for r,(label,ids) in enumerate(conditions,11):put(root,f'B{r}',label);mark(root,r,ids)
 confirm=23+off; ret=[confirm+1,confirm+2,confirm+3]; exc=[confirm+5,confirm+6]; log=confirm+8; result=confirm+9
 for r in ret+exc+[log]:
  put(root,f'B{r}','')
  for n in range(1,13):put(root,f'{col(4+n)}{r}','')
 normal=set(range(1,len(types)+1))-throws
 put(root,f'B{ret[0]}','No return because the function throws.');mark(root,ret[0],throws)
 put(root,f'B{ret[1]}','Return value as asserted by Jest.');mark(root,ret[1],normal)
 put(root,f'B{exc[0]}','No exception.');mark(root,exc[0],normal)
 put(root,f'B{exc[1]}','Error/AppError asserted by Jest.');mark(root,exc[1],throws)
 put(root,f'B{log}','No log message.');mark(root,log,range(1,len(types)+1))
 for n,t in enumerate(types,1):
  c=col(4+n);put(root,f'{c}{result}',t);put(root,f'{c}{result+1}','Passed');put(root,f'{c}{result+2}','11/18');put(root,f'{c}{result+3}','')
with zipfile.ZipFile(SOURCE) as z:entries={x.filename:z.read(x.filename) for x in z.infolist()};infos={x.filename:x for x in z.infolist()}
wb=ET.fromstring(entries['xl/workbook.xml']);rels=ET.fromstring(entries['xl/_rels/workbook.xml.rels']);paths={x.get('Id'):x.get('Target') for x in rels};template=entries[path_for(wb,paths,TEMPLATE)]
for name,cfg in CFG.items():
 p=path_for(wb,paths,name);root=ET.fromstring(template);fill(root,name,cfg);entries[p]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as z:
 for k,v in entries.items():z.writestr(deepcopy(infos[k]),v)
print(OUTPUT.resolve())
