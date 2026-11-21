from copy import deepcopy
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.source.xlsm')
OUTPUT = Path('Report5_Unit Test.filled.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ET.register_namespace('', MAIN)
ET.register_namespace('r', REL)
NS = {'m': MAIN, 'r': REL}
DATE = 46343  # 11/17/2026, preserving the template date number format.

def cases(count):
    return [f'UTCID{index:02d}' for index in range(1, count + 1)]

MATRICES = {
    'CURSOR-01_encode': {
        'code': 'CURSOR-01', 'name': 'encode', 'loc': 4, 'count': 9, 'n': 6, 'a': 3, 'b': 0,
        'requirement': 'Cursor có chữ ký và scope: mã hóa cursor gắn namespace/context bằng HMAC.',
        'precondition': 'Secret thử nghiệm >= 32 bytes, position/context fixture; không cần DB.',
        'conditions': [
            ('position object hợp lệ.', [1]), ('context object hợp lệ.', [1]),
            ('position thay đổi.', [2]), ('context thay đổi.', [3]),
            ('Unicode và nested object được JSON serialize.', [4]), ('namespace khác.', [5]),
            ('secret ngắn hơn 32 bytes.', [7]), ('namespace rỗng.', [8]), ('namespace null.', [9]),
        ],
        'return_rows': [('Opaque base64url token có payload và chữ ký.', [1, 2, 3, 4, 5, 6]), ('Không return vì ném TypeError.', [7, 8, 9])],
        'exception_rows': [('No exception', [1, 2, 3, 4, 5, 6]), ("TypeError('Cursor signing configuration required')", [7, 8, 9])],
        'types': ['N'] * 6 + ['A'] * 3,
    },
    'CURSOR-02_decode': {
        'code': 'CURSOR-02', 'name': 'decode', 'loc': 11, 'count': 15, 'n': 2, 'a': 12, 'b': 1,
        'requirement': 'Cursor có chữ ký và scope: xác minh token, chữ ký và context; từ chối cursor không hợp lệ.',
        'precondition': 'Secret thử nghiệm, token hợp lệ do encode tạo và token bị sửa; không cần DB.',
        'conditions': [
            ('Token hợp lệ và context khớp.', [1]), ('Token Unicode/nested context hợp lệ.', [2]),
            ('actor context không khớp.', [3]), ('state context không khớp.', [4]), ('namespace context không khớp.', [5]),
            ('secret khác.', [6]), ('signature bị sửa.', [7]), ('expiresAt đúng bằng clock.', [8]),
            ('token undefined.', [9]), ('token null.', [10]), ('token rỗng.', [11]),
            ('token chứa ký tự ngoài base64url.', [12]), ('token dài hơn 512 ký tự.', [13]),
            ('payload/position sai cấu trúc.', [14, 15]),
        ],
        'return_rows': [('position object ban đầu.', [1, 2]), ('Không return vì ném AppError.', list(range(3, 16)))],
        'exception_rows': [('No exception', [1, 2]), ("AppError(422, 'VALIDATION_FAILED', 'Invalid cursor')", list(range(3, 16)))],
        'types': ['N', 'N', 'A', 'A', 'A', 'A', 'A', 'B'] + ['A'] * 7,
    },
    'SHIFT-IN-01_availabilityInput': {
        'code': 'SHIFT-IN-01', 'name': 'availabilityInput', 'loc': 4, 'count': 14, 'n': 1, 'a': 13, 'b': 0,
        'requirement': 'Kiểm tra DTO gồm zone, workingWindows, effectiveFrom và expectedVersion theo exact top-level keys.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; không cần DB.',
        'conditions': [
            ('DTO có đủ 4 own keys hợp lệ.', [1]), ('zone own value undefined.', [2]),
            ('workingWindows own value undefined.', [3]), ('effectiveFrom own value undefined.', [4]),
            ('expectedVersion own value undefined.', [5]), ('zone missing.', [6]), ('workingWindows missing.', [7]),
            ('effectiveFrom missing.', [8]), ('expectedVersion missing.', [9]), ('DTO null/string/array.', [10, 11, 12]),
            ('Trường top-level không được hỗ trợ.', [13]), ('Giá trị field không được deep validate.', [14]),
        ],
        'return_rows': [('Trả lại đúng reference DTO.', [1, 2, 3, 4, 5, 14]), ('Không return vì ném AppError.', list(range(6, 14)))],
        'exception_rows': [('No exception', [1, 2, 3, 4, 5, 14]), ('AppError validation từ exact.', list(range(6, 14)))],
        'types': ['N'] + ['A'] * 13,
    },
    'SHIFT-IN-02_workAreasInput': {
        'code': 'SHIFT-IN-02', 'name': 'workAreasInput', 'loc': 3, 'count': 10, 'n': 1, 'a': 9, 'b': 0,
        'requirement': 'Kiểm tra DTO areas và expectedVersion theo exact top-level keys.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; không cần DB.',
        'conditions': [
            ('DTO có areas và expectedVersion own keys.', [1]), ('areas missing.', [2]), ('expectedVersion missing.', [3]),
            ('areas own value undefined.', [4]), ('expectedVersion own value undefined.', [5]),
            ('DTO null.', [6]), ('DTO string.', [7]), ('DTO array.', [8]),
            ('Trường top-level không được hỗ trợ.', [9]), ('Giá trị areas/expectedVersion được forward, không deep validate.', [10]),
        ],
        'return_rows': [('Trả lại đúng reference DTO.', [1, 4, 5, 10]), ('Không return vì ném AppError.', [2, 3, 6, 7, 8, 9])],
        'exception_rows': [('No exception', [1, 4, 5, 10]), ('AppError validation từ exact.', [2, 3, 6, 7, 8, 9])],
        'types': ['N'] + ['A'] * 9,
    },
    'SHIFT-IN-03_invitationInput': {
        'code': 'SHIFT-IN-03', 'name': 'invitationInput', 'loc': 5, 'count': 22, 'n': 4, 'a': 17, 'b': 1,
        'requirement': 'Kiểm tra expectedVersion, sitterId optional và only allowed top-level fields.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; sitterId 24-hex hợp lệ; không cần DB.',
        'conditions': [
            ('expectedVersion=0 và không có sitterId.', [1]), ('expectedVersion hợp lệ, sitterId 24-hex hợp lệ.', [2]),
            ('DTO container không phải object.', [3]), ('expectedVersion missing.', [4]), ('expectedVersion undefined.', [5]),
            ('expectedVersion null.', [6]), ('expectedVersion negative.', [7]), ('expectedVersion decimal.', [8]),
            ('expectedVersion string.', [9]), ('expectedVersion > 1000000.', [10]), ('Unexpected top-level field.', [11]),
            ('sitterId missing.', [12]), ('sitterId undefined.', [13]),
            ('sitterId null/empty/malformed/sai kiểu; max và safe-integer boundary.', list(range(14, 23))),
        ],
        'return_rows': [('Trả lại đúng reference DTO.', [1, 2, 14, 15, 21]), ('Không return vì ném AppError.', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 22])],
        'exception_rows': [('No exception', [1, 2, 14, 15, 21]), ('AppError validation từ exact/number/id.', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 22])],
        'types': ['N', 'N'] + ['A'] * 11 + ['N', 'N'] + ['A'] * 5 + ['B', 'A'],
    },
}

def col(number):
    name = ''
    while number:
        number, remainder = divmod(number - 1, 26)
        name = chr(65 + remainder) + name
    return name

def split_ref(reference):
    match = re.match(r'([A-Z]+)([0-9]+)$', reference)
    return match.group(1), int(match.group(2))

def refs(start, end, row):
    def index(name):
        value = 0
        for char in name:
            value = value * 26 + ord(char) - 64
        return value
    return [f'{col(number)}{row}' for number in range(index(start), index(end) + 1)]

def set_cell(sheet_data, reference, value=None):
    column, row_number = split_ref(reference)
    row = next((item for item in sheet_data if item.attrib.get('r') == str(row_number)), None)
    if row is None:
        row = ET.SubElement(sheet_data, f'{{{MAIN}}}row', {'r': str(row_number)})
    cell = next((item for item in row if item.attrib.get('r') == reference), None)
    if cell is None:
        cell = ET.SubElement(row, f'{{{MAIN}}}c', {'r': reference})
    for child in list(cell):
        if child.tag in {f'{{{MAIN}}}f', f'{{{MAIN}}}v', f'{{{MAIN}}}is'}:
            cell.remove(child)
    if value is None:
        cell.attrib.pop('t', None)
        return
    if isinstance(value, (int, float)):
        cell.attrib.pop('t', None)
        ET.SubElement(cell, f'{{{MAIN}}}v').text = str(value)
        return
    cell.attrib['t'] = 'inlineStr'
    inline = ET.SubElement(cell, f'{{{MAIN}}}is')
    text = ET.SubElement(inline, f'{{{MAIN}}}t')
    text.text = value

def mark(sheet_data, row, case_numbers):
    for number in case_numbers:
        set_cell(sheet_data, f'{col(4 + number)}{row}', 'O')

def fill_sheet(root, matrix):
    data = root.find('m:sheetData', NS)
    # Clear only editable matrix values; styles, merges, formulas, validations and dimensions remain untouched.
    for reference in ['C2', 'K2', 'C3', 'K3', 'C4', 'K4', 'C5', 'A7', 'C7', 'E7', 'K7', 'L7', 'M7', 'N7', 'E10']:
        set_cell(data, reference)
    for row in range(9, 39):
        for reference in refs('E', 'Z', row):
            set_cell(data, reference)
    for row in list(range(11, 25)) + [26, 27, 29, 30, 32]:
        set_cell(data, f'B{row}')
    for row in range(42, 51):
        for reference in refs('A', 'P', row):
            set_cell(data, reference)

    count = matrix['count']
    for reference, value in {
        'A2': 'Function Code', 'E2': 'Function Name', 'A3': 'Created By', 'E3': 'Executed By',
        'A4': 'Lines of code', 'E4': 'Lack of test case', 'A5': 'Test requirement',
        'A6': 'Passed', 'C6': 'Failed', 'E6': 'Untested', 'K6': 'N/A/B', 'N6': 'Total Test Cases',
        'A10': 'Condition', 'B10': 'Precondition ', 'A25': 'Confirm', 'B25': 'Return',
        'B28': 'Exception', 'B31': 'Log message', 'A35': 'Result',
        'B35': 'Type(N : Normal, A : Abnormal, B : Boundary)', 'B36': 'Passed/Failed',
        'B37': 'Executed Date', 'B38': 'Defect ID',
    }.items():
        set_cell(data, reference, value)
    set_cell(data, 'C2', matrix['code'])
    set_cell(data, 'K2', matrix['name'])
    set_cell(data, 'C3', 'DatDT')
    set_cell(data, 'K3', 'Jest')
    set_cell(data, 'C4', matrix['loc'])
    set_cell(data, 'K4', 0)
    set_cell(data, 'C5', matrix['requirement'])
    for reference, value in zip(['A7', 'C7', 'E7', 'K7', 'L7', 'M7', 'N7'], [count, 0, 0, matrix['n'], matrix['a'], matrix['b'], count]):
        set_cell(data, reference, value)
    for number, case_id in enumerate(cases(count), 1):
        set_cell(data, f'{col(4 + number)}9', case_id)
    set_cell(data, 'E10', matrix['precondition'])
    for row, (description, numbers) in enumerate(matrix['conditions'], 11):
        set_cell(data, f'B{row}', description)
        mark(data, row, numbers)
    for row, (description, numbers) in zip([26, 27], matrix['return_rows']):
        set_cell(data, f'B{row}', description)
        mark(data, row, numbers)
    for row, (description, numbers) in zip([29, 30], matrix['exception_rows']):
        set_cell(data, f'B{row}', description)
        mark(data, row, numbers)
    set_cell(data, 'B32', 'No log message')
    mark(data, 32, list(range(1, count + 1)))
    for number, test_type in enumerate(matrix['types'], 1):
        set_cell(data, f'{col(4 + number)}35', test_type)
        set_cell(data, f'{col(4 + number)}36', 'Passed')
        set_cell(data, f'{col(4 + number)}37', DATE)

with zipfile.ZipFile(SOURCE) as source:
    entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    infos = {item.filename: item for item in source.infolist()}
    workbook = ET.fromstring(entries['xl/workbook.xml'])
    rels = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
    targets = {item.attrib['Id']: item.attrib['Target'] for item in rels}
    for sheet in workbook.find('m:sheets', NS):
        if sheet.attrib['name'] not in MATRICES:
            continue
        target = 'xl/' + targets[sheet.attrib[f'{{{REL}}}id']]
        root = ET.fromstring(entries[target])
        fill_sheet(root, MATRICES[sheet.attrib['name']])
        entries[target] = ET.tostring(root, encoding='utf-8', xml_declaration=True)

with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as destination:
    for filename, payload in entries.items():
        info = deepcopy(infos[filename])
        destination.writestr(info, payload)

print(OUTPUT.resolve())
