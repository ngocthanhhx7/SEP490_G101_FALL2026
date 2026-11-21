from copy import deepcopy
from pathlib import Path
import posixpath, re, zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.current.xlsm')
OUTPUT = Path('Report5_Unit Test.new-matrices.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
ET.register_namespace('', MAIN); ET.register_namespace('r', REL)

M = {
 'EMP-DISPATCH-03_runBatch': ('EMP-DISPATCH-03','runBatch',28,7,'NNAAAAA',8,'Điều phối batch lời mời; kiểm tra limit, queue, retry và kết quả invite.', [('limit không hợp lệ',[1,2,3,4]),('care plan/queue hợp lệ',[5]),('agent invite thành công',[5]),('dispatchReview retryAt ở tương lai',[6]),('invite trả 409 conflict',[7])]),
 'APP-MAIL-01_runBatch': ('APP-MAIL-01','runBatch',46,12,'NNAAAAAAAAAA',7,'Claim và gửi application mail ngoài transaction; kiểm tra limit, delivery state, retry và lease.', [('limit không hợp lệ',[1,2,3,4]),('mail được claim và ACCEPTED',[5]),('delivery uncertain',[6]),('contact không VERIFIED',[7]),('origin không HTTPS',[8]),('delivery throw',[9]),('retryable failure attempts < 3',[10]),('retryable failure attempt = 3',[11]),('SENDING lease expired',[12])]),
 'DASH-EARN-01_projectEarnings': ('DASH-EARN-01','projectEarnings',28,10,'NNNAAAAAAN',6,'Tổng hợp earnings snapshot theo sitter; loại cancel và từ chối ledger không nhất quán.', [('snapshot hợp lệ',[1]),('booking CANCELLED',[2]),('owner/balance/state invalid',[3,4,7]),('paid không có transfer evidence',[5,9]),('explanation invalid',[6]),('duplicate resource',[8]),('paid có transfer evidence',[10])]),
 'PAGE-01_paginate': ('PAGE-01','paginate',10,4,'NNNA',6,'Áp dụng list query và countDocuments với filter nhất quán, offset và collation.', [('filter/sort/page/limit hợp lệ',[1]),('page vượt dữ liệu',[2]),('countDocuments throw',[3]),('collation được cung cấp',[4])]),
 'PAGE-IN-01_parsePageQuery': ('PAGE-IN-01','parsePageQuery',14,13,'NBAAAAAAAABNN',7,'Phân tích page/limit, default và giới hạn theo PAGE_LIMITS.', [('query missing/default',[1]),('page/limit maximum hợp lệ',[2]),('page invalid',[3,4,5,6]),('limit invalid',[7,8,9,10]),('custom default/max',[11]),('page undefined',[12]),('limit undefined',[13])]),
}

THROWS = {
 'EMP-DISPATCH-03_runBatch': {1,2,3,4},
 'APP-MAIL-01_runBatch': {1,2,3,4},
 'DASH-EARN-01_projectEarnings': {3,4,5,6,7,8,9},
 'PAGE-01_paginate': {3},
 'PAGE-IN-01_parsePageQuery': {3,4,5,6,7,8,9,10},
}

RETURNS = {
 'EMP-DISPATCH-03_runBatch': 'Batch result { processed, invited, review }.',
 'APP-MAIL-01_runBatch': 'Batch result { claimed, sent, skipped, failed, uncertain, retried }.',
 'DASH-EARN-01_projectEarnings': 'Projected items and earnings metrics.',
 'PAGE-01_paginate': 'Page result { items, page, limit, total }.',
 'PAGE-IN-01_parsePageQuery': 'Parsed { page, limit }.',
}

def col(n):
 s=''
 while n: n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def cell(root, addr):
 for x in root.findall('.//m:c',NS):
  if x.get('r')==addr:return x
 row=int(re.search(r'\d+',addr).group()); parent=next(x for x in root.find('m:sheetData',NS) if x.get('r')==str(row)); return ET.SubElement(parent,f'{{{MAIN}}}c',{'r':addr})
def put(root,addr,value):
 x=cell(root,addr)
 for y in list(x): x.remove(y)
 x.attrib.pop('t',None)
 if isinstance(value,(int,float)):ET.SubElement(x,f'{{{MAIN}}}v').text=str(value)
 else:
  x.attrib['t']='inlineStr';i=ET.SubElement(x,f'{{{MAIN}}}is');ET.SubElement(i,f'{{{MAIN}}}t').text=value
def mark(root,row,ids):
 for n in ids:put(root,f'{col(4+n)}{row}','O')

with zipfile.ZipFile(SOURCE) as z:
 entries={x.filename:z.read(x.filename) for x in z.infolist()}; infos={x.filename:x for x in z.infolist()}
wb=ET.fromstring(entries['xl/workbook.xml']); rel=ET.fromstring(entries['xl/_rels/workbook.xml.rels']); targets={x.get('Id'):x.get('Target') for x in rel}
for sh in wb.find('m:sheets',NS):
 if sh.get('name') not in M:continue
 sheet_name=sh.get('name'); code,name,loc,count,types,lack,req,conditions=M[sheet_name]; assert len(types)==count
 path=posixpath.normpath(posixpath.join('xl',targets[sh.get(f'{{{REL}}}id')]));root=ET.fromstring(entries[path])
 for a,v in {'C2':code,'K2':name,'C3':'DatDT','K3':'Jest','C4':loc,'K4':lack,'C5':req,'E10':'Mocked unit fixtures; no database or external provider.','A7':count,'C7':0,'E7':0,'K7':types.count('N'),'L7':types.count('A'),'M7':types.count('B'),'N7':count}.items():put(root,a,v)
 for r in range(11,25):
  put(root,f'B{r}','')
  for n in range(1,16):put(root,f'{col(4+n)}{r}','')
 for r,(desc,ids) in enumerate(conditions,11):put(root,f'B{r}',desc);mark(root,r,ids)
 throws=THROWS[sheet_name]; normal=set(range(1,count+1))-throws
 put(root,'B26',RETURNS[sheet_name]);mark(root,26,normal);put(root,'B27','No return because the function throws.');mark(root,27,throws)
 put(root,'B30','No exception.');mark(root,30,normal);put(root,'B31','Error/AppError as asserted by Jest.');mark(root,31,throws);put(root,'B33','No log message.');mark(root,33,range(1,count+1))
 for n,t in enumerate(types,1):
  c=col(4+n);put(root,f'{c}35',t);put(root,f'{c}36','Passed');put(root,f'{c}37','11/18');put(root,f'{c}38','')
 entries[path]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as z:
 for k,v in entries.items():z.writestr(deepcopy(infos[k]),v)
print(OUTPUT.resolve())
