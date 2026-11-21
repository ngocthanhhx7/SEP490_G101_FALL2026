from copy import deepcopy
from pathlib import Path
import posixpath, re, zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.current.xlsm')
OUTPUT = Path('Report5_Unit Test.emp-refined.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
TARGET = 'EMP-DISPATCH-03_runBatch'

CONDITIONS = [
    ('limit = 0 (below minimum)', [1]),
    ('limit = 21 (above maximum)', [2]),
    ('limit = 1.5 (decimal)', [3]),
    ("limit = '1' (string)", [4]),
    ('limit = 2 (valid)', [5]),
    ('carePlans.runBatch exists', [5]),
    ('queue row has a valid visit id', [5]),
    ('queue row version = 3', [5]),
    ('dispatchReview.retryAt is in the future', [6]),
    ('invite rejects with status = 409', [7]),
    ('invite error code = VERSION_CONFLICT', [7]),
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

# Only non-bold editable cells are changed. The template's bold labels remain untouched.
for row in range(11, 25):
    put(root, f'B{row}', '')
    for case_id in range(1, 8):
        put(root, f'{col(4 + case_id)}{row}', '')
for row, (label, case_ids) in enumerate(CONDITIONS, 11):
    put(root, f'B{row}', label)
    mark(root, row, case_ids)

for row in (26, 27, 28, 30, 31, 33):
    put(root, f'B{row}', '')
    for case_id in range(1, 8):
        put(root, f'{col(4 + case_id)}{row}', '')

put(root, 'B26', 'No return; throws AppError code VALIDATION_FAILED.')
mark(root, 26, [1, 2, 3, 4])
put(root, 'B27', 'Batch result { processed: 1, invited: 1, review: 0 }.')
mark(root, 27, [5])
put(root, 'B28', 'Batch result { processed: 0, invited: 0, review: 0 } / { processed: 1, invited: 0, review: 1 }.')
mark(root, 28, [6, 7])
put(root, 'B30', 'No exception.')
mark(root, 30, [5, 6, 7])
put(root, 'B31', 'AppError code VALIDATION_FAILED.')
mark(root, 31, [1, 2, 3, 4])
put(root, 'B33', 'No log message.')
mark(root, 33, range(1, 8))

entries[path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, content in entries.items():
        archive.writestr(deepcopy(infos[name]), content)
print(OUTPUT.resolve())
