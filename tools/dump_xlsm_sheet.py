from pathlib import Path
import sys
import zipfile
import xml.etree.ElementTree as ET

MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ns = {'m': MAIN, 'r': REL}
path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('Report5_Unit Test.source.xlsm')
sheet_name = sys.argv[1]
sys.stdout.reconfigure(encoding='utf-8')

with zipfile.ZipFile(path) as archive:
    shared = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        shared = [''.join(item.itertext()) for item in strings.findall('m:si', ns)]
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    targets = {item.attrib['Id']: item.attrib['Target'] for item in relationships}
    sheet = next(item for item in workbook.find('m:sheets', ns) if item.attrib['name'] == sheet_name)
    target = targets[sheet.attrib[f'{{{REL}}}id']]
    root = ET.fromstring(archive.read('xl/' + target))
    for row in root.findall('.//m:sheetData/m:row', ns):
        if int(row.attrib['r']) > 40:
            continue
        cells = []
        for cell in row.findall('m:c', ns):
            value = cell.findtext('m:v', default='', namespaces=ns)
            if cell.attrib.get('t') == 's' and value:
                value = shared[int(value)]
            elif cell.attrib.get('t') == 'inlineStr':
                value = ''.join(cell.itertext())
            formula = cell.findtext('m:f', default='', namespaces=ns)
            cells.append(f"{cell.attrib['r']}={value!r}" + (f" [{formula}]" if formula else ''))
        if cells:
            print(' | '.join(cells))
    merges = root.find('m:mergeCells', ns)
    if merges is not None:
        print('MERGES:', ','.join(item.attrib['ref'] for item in merges))
