from copy import deepcopy
from pathlib import Path
import posixpath, re, zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.current.xlsm')
OUTPUT = Path('Report5_Unit Test.app-mail-template.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
TARGET = 'APP-MAIL-01_runBatch'
TEMPLATE = 'FE-PAGE-DTO-01_readPagination'

CONDITIONS = [
    ('limit = 0 (below minimum)', [1]),
    ('limit = 21 (above maximum)', [2]),
    ('limit = 1.5 (decimal)', [3]),
    ("limit = '1' (string)", [4]),
    ('claimed PENDING mail and provider status = ACCEPTED', [5]),
    ('provider status = FAILED and uncertain = true', [6]),
    ('Contact.exists returns false (recipient not verified)', [7]),
    ('webOrigin = HTTP URL (not HTTPS)', [8]),
    ('delivery.send throws unexpected provider error', [9]),
    ('provider failure retryable = true and attempts = 1', [10]),
    ('provider failure retryable = true and attempts = 3', [11]),
    ('expired SENDING lease exists before mail claim', [12]),
]
TYPES = 'BBAANAAAAABA'

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
    if isinstance(value, (int, float)):
        ET.SubElement(item, f'{{{MAIN}}}v').text = str(value)
    else:
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
path_for = lambda name: posixpath.normpath(posixpath.join('xl', paths[next(item for item in workbook.find('m:sheets', NS) if item.get('name') == name).get(f'{{{REL}}}id')]))
target_path, template_path = path_for(TARGET), path_for(TEMPLATE)
root = ET.fromstring(entries[template_path])

for address, value in {
    'C2': 'APP-MAIL-01', 'K2': 'runBatch', 'C3': 'DatDT', 'K3': 'Jest',
    'C4': 46, 'K4': 7,
    'C5': 'Claim và gửi application mail ngoài transaction; kiểm tra limit, delivery state, retry và lease.',
    'A7': 12, 'C7': 0, 'E7': 0, 'K7': TYPES.count('N'), 'L7': TYPES.count('A'),
    'M7': TYPES.count('B'), 'N7': 12,
    'E10': 'Mocked unit fixtures; no database or external provider.'
}.items():
    put(root, address, value)

for row in range(11, 23):
    put(root, f'B{row}', '')
    for case_id in range(1, 13):
        put(root, f'{col(4 + case_id)}{row}', '')
for row, (label, case_ids) in enumerate(CONDITIONS, 11):
    put(root, f'B{row}', label)
    mark(root, row, case_ids)

for row in (24, 25, 26, 28, 29, 31):
    put(root, f'B{row}', '')
    for case_id in range(1, 13):
        put(root, f'{col(4 + case_id)}{row}', '')
put(root, 'B24', 'No return; invalid limit rejects, or invalid webOrigin throws at construction.')
mark(root, 24, [1, 2, 3, 4, 8])
put(root, 'B25', 'Batch result { processed: 1, accepted: 1, failed: 0, unknown: 0 }.')
mark(root, 25, [5, 12])
put(root, 'B26', 'Batch result records UNKNOWN, SKIPPED, PENDING or FAILED state.')
mark(root, 26, [6, 7, 9, 10, 11])
put(root, 'B28', 'No exception; outcome is returned by runBatch.')
mark(root, 28, [5, 6, 7, 9, 10, 11, 12])
put(root, 'B29', 'Validation error / TypeError before processing.')
mark(root, 29, [1, 2, 3, 4, 8])
put(root, 'B31', 'No log message.')
mark(root, 31, range(1, 13))

for case_id, case_type in enumerate(TYPES, 1):
    column = col(4 + case_id)
    put(root, f'{column}32', case_type)
    put(root, f'{column}33', 'Passed')
    put(root, f'{column}34', '11/18')
    put(root, f'{column}35', '')

entries[target_path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, content in entries.items():
        archive.writestr(deepcopy(infos[name]), content)
print(OUTPUT.resolve())
