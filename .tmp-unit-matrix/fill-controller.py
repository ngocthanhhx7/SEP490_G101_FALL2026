import copy, datetime, json, pathlib, re, zipfile, xml.etree.ElementTree as E
from xml.sax.saxutils import escape

base=pathlib.Path('.tmp-unit-matrix')
source=base/'controller-source.xlsm'
n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile(source)
styles=E.fromstring(z.read('xl/styles.xml'))
fonts=list(styles.find('m:fonts',n)); xfs=list(styles.find('m:cellXfs',n))
strings=list(E.fromstring(z.read('xl/sharedStrings.xml')))
def bold(c):
 font=fonts[int(xfs[int(c.get('s','0'))].get('fontId','0'))]
 b=font.find('m:b',n)
 if b is not None and b.get('val','1') not in ('0','false'): return True
 v=c.find('m:v',n)
 rich=strings[int(v.text)] if c.get('t')=='s' and v is not None else c.find('m:is',n)
 return rich is not None and any(b.get('val','1') not in ('0','false') for b in rich.findall('.//m:b',n))
def value(c):
 v=c.find('m:v',n)
 if c.get('t')=='s' and v is not None: return ''.join(strings[int(v.text)].itertext())
 if c.get('t')=='inlineStr': return ''.join(c.find('m:is',n).itertext())
 return v.text if v is not None else ''
configs=[('EMP-CTL-01','dispatchDetails',11),('GRM-CTL-01','options',10),('GRM-CTL-02','slots',9),('GRM-CTL-03','quote',8),('GRM-CTL-04','book',7)]
updates={}; proof={}; designs={}
for code,method,num in configs:
 file=f'xl/worksheets/sheet{num}.xml'
 raw=z.read(file).decode(); root=E.fromstring(raw)
 cells={c.get('r'):c for c in root.findall('.//m:sheetData/m:row/m:c',n)}
 result=json.loads((base/(code+'.json')).read_text(encoding='utf-8'))
 tests=result['testResults'][0]['assertionResults']
 assert len(tests)==15 and all(t['status']=='passed' for t in tests)
 types=[re.search(r'\[([NAB])\]',t['title'])[1] for t in tests]
 u={'C2':code,'K2':method,'C3':'DatDT','K3':'Jest','C4':1,'K4':0,
    'C5':('UC-31: chi tiết điều phối; actor + ID → service → JSON/lỗi.' if num==11 else f'UC-58: {method}; request → service → HTTP '+('201' if method=='book' else '200')+'/lỗi.'),
    'A7':15,'C7':0,'E7':0,'K7':types.count('N'),'L7':types.count('A'),'M7':types.count('B'),'N7':15}
 # Conditions describe one input at a time; exact fixtures and objectives are in the traceability report.
 if num==11:
  rows=[('Actor: ACTIVE STAFF',[1,2,3,4,5,6,7,9,10,11,12,13,14,15]),('Actor: missing',[8]),('ID: 24 hex, giữ nguyên case',[1,2,8,9,10,11,12,13,14,15]),('ID: 23 ký tự',[3]),('ID: 25 ký tự',[4]),('ID: 24 chữ g (non-hex)',[5]),('ID: undefined',[6]),('ID: number 123',[7]),('Service: detail DTO',[1,2,15]),('Service: null',[9]),('Service: undefined',[10]),('Service: pending → DTO',[11]),('Service: AppError 403 / 404',[8,12]),('Service: Error offline',[13,14])]
  success=[1,2,9,10,11,15]; called=[1,2,8,9,10,11,12,13,14,15]
  confirms=[(26,'json({data,meta}) một lần',success),(27,'details(auth,id) một lần',called),(28,'Không gọi service',[3,4,5,6,7]),(30,'AppError 422 / 403 / 404',[3,4,5,6,7,8,12]),(31,'Throw/reject cùng Error',[13,14]),(33,'Không log tại controller',list(range(1,16))),(34,'Lỗi: không gửi response',[3,4,5,6,7,8,12,13,14])]
 else:
  d=json.loads((base/(code+'-design.json')).read_text()); designs[code]=d
  success=[i for i,c in enumerate(d['cases'],1) if not(c[3].get('error') or c[3].get('raw'))]
  if method=='book':
   rows=[('Actor: ACTIVE CUSTOMER',[i for i in range(1,16) if i!=5]),('Actor: missing',[5]),('Body: booking payload',[i for i in range(1,16) if i!=6]),('Body: null',[6]),('Key: booking-key-001',[1,*range(5,16)]),('Key: undefined',[2]),('Key: empty string',[3]),('Key: 3 spaces',[4]),('Service: DTO / null / undefined',[1,13,14]),('Service: pending → DTO',[12]),('Service: Error offline',[7,8]),('Service: code 11000',[9]),('Service: schema error',[10,11]),('Service: AppError',[2,3,4,5,6,15])]
  else:
   rows=[('Actor: ACTIVE CUSTOMER',[i for i in range(1,16) if i not in ([5,6] if method=='options' else [5])]),('Actor: missing',[5]),('Actor: null' if method=='options' else 'Body: selection payload',[6] if method=='options' else [i for i in range(1,16) if i!=6]),('Fields khác: không đọc' if method=='options' else 'Body: null',list(range(1,16)) if method=='options' else [6]),('Service: DTO',[1,13,14]),('Service: empty / zero',[2]),('Service: null',[3]),('Service: undefined',[4]),('Service: pending → DTO',[12]),('Service: Error offline',[7,8]),('Service: code 11000',[9]),('Service: ValidationError',[10]),('Service: StrictModeError',[11]),('Service: AppError',[5,6,15])]
  confirms=[(26,'json({data,meta}) một lần',success),(27,'status('+('201' if method=='book' else '200')+') một lần',success),(28,'Gọi service đúng args, 1 lần',list(range(1,16))),(30,'Giữ nguyên lỗi service',[i for i,c in enumerate(d['cases'],1) if c[3].get('error')]),(31,'11000→409; schema→422',[9,10,11]),(33,'Không log tại controller',list(range(1,16))),(34,'Lỗi: không gửi response',[i for i in range(1,16) if i not in success])]
 assert len(rows)==14
 for row,(label,indices) in enumerate(rows,11):
  u['B'+str(row)]=label
  for i in indices: u[chr(68+i)+str(row)]='O'
 for row,label,indices in confirms:
  if row == 34: continue
  u['B'+str(row)]=label
  for i in indices: u[chr(68+i)+str(row)]='O'
 date=(datetime.date(2026,11,18)-datetime.date(1899,12,30)).days
 for i,t in enumerate(tests,1):
  col=chr(68+i)
  u[col+'10']='Mock service'
  u[col+'35']=types[i-1];u[col+'36']='Passed';u[col+'37']=date
 for addr,val in u.items():
  c=cells[addr]
  assert not bold(c),f'Protected {code}!{addr}'
  assert c.find('m:f',n) is None,f'Formula {addr}'
  assert not value(c) or addr in ['C2','K2','C3','K3','C4','K4','C5','A7','C7','E7','K7','L7','M7','N7'],f'Existing content {addr}'
  pattern=r'<c\b[^>]*\br="'+addr+r'"[^>]*?(?:/>|>.*?</c>)'
  match=re.search(pattern,raw);assert match,addr
  old=match.group(); opening=old.split('>')[0].removesuffix('/')
  opening=re.sub(r'\s+t="[^"]*"','',opening)
  if isinstance(val,int): new=opening+'><v>'+str(val)+'</v></c>'
  else: new=opening+' t="inlineStr"><is><t>'+escape(val)+'</t></is></c>'
  raw=raw[:match.start()]+new+raw[match.end():]
 after=E.fromstring(raw); aftercells={c.get('r'):c for c in after.findall('.//m:sheetData/m:row/m:c',n)}
 for addr,c in cells.items():
  a=aftercells[addr]
  if addr not in u: assert E.tostring(c)==E.tostring(a),addr
  else:
   assert {k:v for k,v in c.attrib.items() if k!='t'}=={k:v for k,v in a.attrib.items() if k!='t'}
   assert value(a)==str(u[addr]),addr
 for tag in ['mergeCells','cols','dataValidations','conditionalFormatting']:
  assert [E.tostring(e) for e in root.findall('m:'+tag,n)]==[E.tostring(e) for e in after.findall('m:'+tag,n)]
 assert [r.attrib for r in root.findall('.//m:row',n)]==[r.attrib for r in after.findall('.//m:row',n)]
 updates[file]=raw.encode();proof[code]={'changedCells':len(u),'boldCellsPreserved':sum(bold(c) for c in cells.values()),'passed':15,'types':{t:types.count(t) for t in 'NAB'},'sheet':code+'_'+method,'rows':rows}
out=base/'controller-completed.xlsm'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
 for item in z.infolist(): target.writestr(copy.copy(item),updates.get(item.filename,z.read(item.filename)))
with zipfile.ZipFile(out) as target:
 assert target.namelist()==z.namelist()
 changed=[p for p in z.namelist() if target.read(p)!=z.read(p)]
 assert set(changed)==set(updates)
print(json.dumps({'changedParts':changed,'verification':proof},ensure_ascii=False))
(base/'controller-workbook-verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')



