from copy import deepcopy
from pathlib import Path
import posixpath, zipfile
import xml.etree.ElementTree as ET

BASE = Path('Report5_Unit Test.current.xlsm')
CURRENT = Path('Report5_Unit Test.app-mail-refined.xlsm')
OUTPUT = Path('Report5_Unit Test.app-mail-restored.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
TARGET = 'APP-MAIL-01_runBatch'

def sheet_path(entries):
    workbook = ET.fromstring(entries['xl/workbook.xml'])
    relationships = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
    paths = {item.get('Id'): item.get('Target') for item in relationships}
    sheet = next(item for item in workbook.find('m:sheets', NS) if item.get('name') == TARGET)
    return posixpath.normpath(posixpath.join('xl', paths[sheet.get(f'{{{REL}}}id')]))

with zipfile.ZipFile(BASE) as archive:
    base_entries = {item.filename: archive.read(item.filename) for item in archive.infolist()}
with zipfile.ZipFile(CURRENT) as archive:
    entries = {item.filename: archive.read(item.filename) for item in archive.infolist()}
    infos = {item.filename: item for item in archive.infolist()}

entries[sheet_path(entries)] = base_entries[sheet_path(base_entries)]
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, content in entries.items():
        archive.writestr(deepcopy(infos[name]), content)
print(OUTPUT.resolve())
