from copy import deepcopy
from pathlib import Path
import posixpath, re, zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.current.xlsm')
OUTPUT = Path('Report5_Unit Test.app-mail-refined.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
TARGET = 'APP-MAIL-01_runBatch'

CONDITIONS = [
    ('limit = 0 (below minimum)', [1]),
    ('limit = 21 (above maximum)', [2]),
    ('limit = 1.5 (decimal)', [3]),
    ("limit = '1' (string)", [4]),
    ('claimed PENDING mail; provider status = ACCEPTED', [5]),
    ('provider status = FAILED and uncertain = true', [6]),
    ('Contact.exists returns false (recipient not verified)', [7]),
    ('webOrigin = http URL (not HTTPS)', [8]),
    ('delivery.send throws an unexpected error', [9]),
    ('provider failure retryable = true; attempts = 1', [10]),
    ('provider failure retryable = true; attempts = 3', [11]),
    ('expired SENDING lease exists before claim', [12]),
]

def col(number):
    value = ''
    while number:
        number, remainder = divmod(number - 1, 26)
        value = chr(65 + remainder) + value
    return value

def get_cell(root, address):
    for item in root.findall('.//m:c', NS):
        if item.get('r') == address:
            return item
    row = re.search(r'\d+', address).group()
    parent = next(item for item in root.find('m:sheetData', NS) if item.get('r') == row)
    return ET.SubElement(parent, f'{{{MAIN}}}c', {'r': address})

def put(root, address, value):
    item = get_cell(root, address)
    for child in list(item):
        item.remove(child)
    item.attrib.pop('t', None)
    item.attrib['t'] = 'inlineStr'
    inline = ET.SubElement(item, f'{{{MAIN}}}is')
    ET.SubElement(inline, f'{{{MAIN}}}t').text = value

def mark(root, row, case_ids):
    for case_id in case_ids:
        put(root, f'{col(4 + case_id)}{row}', 'O')

with zipfile.ZipFile(SOURCE) as archive:
    entries = {item.filename: archive.read(item.filename) for item in archive.infolist()}
    infos = {item.filename: item for item in archive.infolist()}
workbook = ET.fromstring(entries['xl/workbook.xml'])
relationships = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
paths = {item.get('Id'): item.get('Target') for item in relationships}
sheet = next(item for item in workbook.find('m:sheets', NS) if item.get('name') == TARGET)
path = posixpath.normpath(posixpath.join('xl', paths[sheet.get(f'{{{REL}}}id')]))
root = ET.fromstring(entries[path])

# Preserve all cells outside UTCID01–UTCID12 and all bold template cells.
for row in range(11, 25):
    put(root, f'B{row}', '')
    for case_id in range(1, 13):
        put(root, f'{col(4 + case_id)}{row}', '')
for row, (label, case_ids) in enumerate(CONDITIONS, 11):
    put(root, f'B{row}', label)
    mark(root, row, case_ids)

for row in (26, 27, 28, 30, 31, 33):
    put(root, f'B{row}', '')
    for case_id in range(1, 13):
        put(root, f'{col(4 + case_id)}{row}', '')
put(root, 'B26', 'No return; throws "Bounded mail batch required" / TypeError at construction.')
mark(root, 26, [1, 2, 3, 4, 8])
put(root, 'B27', 'Batch result accepted: { processed: 1, accepted: 1, failed: 0, unknown: 0 }.')
mark(root, 27, [5, 12])
put(root, 'B28', 'Batch result for UNKNOWN, SKIPPED or retry/FAILED delivery state.')
mark(root, 28, [6, 7, 9, 10, 11])
put(root, 'B30', 'No exception; failure is handled in the batch result.')
mark(root, 30, [5, 6, 7, 9, 10, 11, 12])
put(root, 'B31', 'Throws configured validation/TypeError before processing.')
mark(root, 31, [1, 2, 3, 4, 8])
put(root, 'B33', 'No log message.')
mark(root, 33, range(1, 13))

entries[path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, content in entries.items():
        archive.writestr(deepcopy(infos[name]), content)
print(OUTPUT.resolve())
