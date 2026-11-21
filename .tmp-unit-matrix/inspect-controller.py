import zipfile, xml.etree.ElementTree as E
z=zipfile.ZipFile('.tmp-unit-matrix/controller-source.xlsm')
n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
styles=E.fromstring(z.read('xl/styles.xml'))
fonts=list(styles.find('m:fonts',n)); xfs=list(styles.find('m:cellXfs',n))
ss=list(E.fromstring(z.read('xl/sharedStrings.xml')))
rels={x.get('Id'):x.get('Target') for x in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
for s in E.fromstring(z.read('xl/workbook.xml')).find('m:sheets',n):
 if not any(t in s.get('name') for t in ['EMP-CTL-01','GRM-CTL','FE-PAGE-DTO-01']): continue
 p=rels[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
 root=E.fromstring(z.read(p.lstrip('/') if p.startswith('/') else 'xl/'+p))
 print('\nSHEET',s.get('name'),p,str(root.find('m:dimension',n)))
 for c in root.findall('.//m:sheetData/m:row/m:c',n):
  v=c.find('m:v',n); value=v.text if v is not None else ''
  rich=ss[int(value)] if c.get('t')=='s' and value else c.find('m:is',n)
  if rich is not None: value=''.join(rich.itertext())
  bold=fonts[int(xfs[int(c.get('s','0'))].get('fontId','0'))].find('m:b',n) is not None or (rich is not None and rich.find('.//m:b',n) is not None)
  if value: print(c.get('r'), 'BOLD' if bold else 'editable', repr(value))

