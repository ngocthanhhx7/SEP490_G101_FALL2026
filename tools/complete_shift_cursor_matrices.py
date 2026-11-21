from copy import deepcopy
from pathlib import Path
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.shift-in-03-expanded.xlsm')
OUTPUT = Path('Report5_Unit Test.shift-cursor-completed.xlsm')
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
ET.register_namespace('', MAIN)
ET.register_namespace('r', REL)


MATRICES = {
    'CURSOR-01_encode': {
        'code': 'CURSOR-01', 'function': 'encode', 'loc': 4, 'count': 9, 'types': 'NNNNNNAAA',
        'requirement': 'Cursor có chữ ký và scope: mã hóa position gắn context/filter bằng HMAC.',
        'precondition': 'Secret thử nghiệm >= 32 bytes, position/context fixture; không cần DB.',
        'conditions': [
            ('position object hợp lệ.', [1]), ('context object hợp lệ.', [1]),
            ('position/context giống nhau tại clock cố định.', [2]), ('position thay đổi.', [3]),
            ('context thay đổi.', [4]), ('Unicode và nested object JSON-serializable.', [5]),
            ('namespace thay đổi.', [6]), ('secret ngắn hơn 32 bytes.', [7]),
            ('namespace rỗng.', [8]), ('namespace null.', [9]),
        ],
        'return': [('Opaque base64url token chứa payload và chữ ký.', range(1, 7)), ('Không return vì ném TypeError.', range(7, 10))],
        'exception': [('No exception.', range(1, 7)), ("TypeError('Cursor signing configuration required').", range(7, 10))],
    },
    'CURSOR-02_decode': {
        'code': 'CURSOR-02', 'function': 'decode', 'loc': 11, 'count': 15, 'types': 'NNAAAAABAAAAAAA',
        'requirement': 'Cursor có chữ ký và scope: xác minh token, chữ ký, context và expiry; từ chối token không hợp lệ.',
        'precondition': 'Secret thử nghiệm, token hợp lệ do encode tạo và token bị sửa; không cần DB.',
        'conditions': [
            ('Token hợp lệ và context khớp.', [1]), ('Unicode/nested position và context hợp lệ.', [2]),
            ('actor context không khớp.', [3]), ('state context không khớp.', [4]),
            ('namespace không khớp.', [5]), ('secret khác.', [6]), ('signature bị sửa.', [7]),
            ('expiresAt đúng bằng clock.', [8]), ('token undefined.', [9]), ('token null.', [10]),
            ('token rỗng.', [11]), ('token chứa ký tự ngoài base64url.', [12]),
            ('token dài hơn 512 ký tự.', [13]), ('payload thiếu signature.', [14]),
            ('payload đã ký có position không phải object.', [15]),
        ],
        'return': [('position object ban đầu.', [1, 2]), ('Không return vì ném AppError.', range(3, 16))],
        'exception': [('No exception.', [1, 2]), ("AppError(422, 'VALIDATION_FAILED', 'Invalid cursor').", range(3, 16))],
    },
    'SHIFT-IN-01_availabilityInput': {
        'code': 'SHIFT-IN-01', 'function': 'availabilityInput', 'loc': 4, 'count': 14, 'types': 'NAAAAAAAAAAAAA',
        'requirement': 'Kiểm tra own top-level keys zone, workingWindows, effectiveFrom và expectedVersion.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; không cần DB.',
        'conditions': [
            ('DTO có đủ 4 own keys.', [1]), ('zone own value undefined.', [2]),
            ('workingWindows own value undefined.', [3]), ('effectiveFrom own value undefined.', [4]),
            ('expectedVersion own value undefined.', [5]), ('zone missing.', [6]),
            ('workingWindows missing.', [7]), ('effectiveFrom missing.', [8]),
            ('expectedVersion missing.', [9]), ('DTO null.', [10]), ('DTO string.', [11]),
            ('DTO array.', [12]), ('Trường top-level không được hỗ trợ.', [13]),
            ('Field values được forward, không deep validate.', [14]),
        ],
        'return': [('Trả lại đúng reference DTO.', [1, 2, 3, 4, 5, 14]), ('Không return vì ném AppError.', range(6, 14))],
        'exception': [('No exception.', [1, 2, 3, 4, 5, 14]), ("AppError(422, 'VALIDATION_FAILED', 'Invalid fields').", range(6, 14))],
    },
    'SHIFT-IN-02_workAreasInput': {
        'code': 'SHIFT-IN-02', 'function': 'workAreasInput', 'loc': 3, 'count': 10, 'types': 'NAAAAAAAAA',
        'requirement': 'Kiểm tra own top-level keys areas và expectedVersion.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; không cần DB.',
        'conditions': [
            ('DTO có areas và expectedVersion own keys.', [1]), ('areas missing.', [2]),
            ('expectedVersion missing.', [3]), ('areas own value undefined.', [4]),
            ('expectedVersion own value undefined.', [5]), ('DTO null.', [6]), ('DTO string.', [7]),
            ('DTO array.', [8]), ('Trường top-level không được hỗ trợ.', [9]),
            ('areas/expectedVersion được forward, không deep validate.', [10]),
        ],
        'return': [('Trả lại đúng reference DTO.', [1, 4, 5, 10]), ('Không return vì ném AppError.', [2, 3, 6, 7, 8, 9])],
        'exception': [('No exception.', [1, 4, 5, 10]), ("AppError(422, 'VALIDATION_FAILED', 'Invalid fields').", [2, 3, 6, 7, 8, 9])],
    },
    'SHIFT-IN-03_invitationInput': {
        'code': 'SHIFT-IN-03', 'function': 'invitationInput', 'loc': 5, 'count': 22, 'types': 'NNAAAAAAAAAAANNAAAAABA',
        'requirement': 'Kiểm tra expectedVersion, sitterId optional và only allowed top-level fields.',
        'precondition': 'DTO fixture hợp lệ/không hợp lệ; sitterId 24-hex hợp lệ; không cần DB.',
        'conditions': [
            ('expectedVersion = 0, không có sitterId.', [1]), ('expectedVersion = 1000000, sitterId hợp lệ.', [2]),
            ('DTO null.', [3]), ('DTO string.', [4]), ('DTO array.', [5]),
            ('expectedVersion missing.', [6]), ('expectedVersion undefined.', [7]),
            ('expectedVersion null.', [8]), ('expectedVersion negative.', [9]),
            ('expectedVersion decimal.', [10]), ('expectedVersion string.', [11]),
            ('expectedVersion > 1000000.', [12]), ('Trường top-level không được hỗ trợ.', [13]),
            ('sitterId missing.', [14]), ('sitterId undefined.', [15]), ('sitterId null.', [16]),
            ('sitterId rỗng.', [17]), ('sitterId sai định dạng.', [18]), ('sitterId number.', [19]),
            ('sitterId array.', [20]), ('expectedVersion = 1000000 boundary.', [21]),
            ('expectedVersion không phải safe integer.', [22]),
        ],
        'return': [('Trả lại đúng reference DTO.', [1, 2, 14, 15, 21]), ('Không return vì ném AppError.', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 22])],
        'exception': [('No exception.', [1, 2, 14, 15, 21]), ("AppError(422, 'VALIDATION_FAILED').", [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 22])],
    },
}


def col_number(name):
    value = 0
    for char in name:
        value = value * 26 + ord(char) - 64
    return value


def col_name(value):
    name = ''
    while value:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def split_cell(address):
    match = re.fullmatch(r'([A-Z]+)(\d+)', address)
    return match.group(1), int(match.group(2))


def update_rows(reference, insert_at, count):
    def replace(match):
        column, row = match.groups()
        row = int(row)
        return f'{column}{row + count if row >= insert_at else row}'
    return re.sub(r'([A-Z]+)(\d+)', replace, reference)


def cell_map(root):
    return {cell.attrib['r']: cell for cell in root.findall('.//m:sheetData/m:row/m:c', NS)}


def clear_value(cell):
    for child in list(cell):
        if child.tag in {f'{{{MAIN}}}f', f'{{{MAIN}}}v', f'{{{MAIN}}}is'}:
            cell.remove(child)
    cell.attrib.pop('t', None)


def set_cell(root, address, value):
    cells = cell_map(root)
    cell = cells.get(address)
    if cell is None:
        column, row_number = split_cell(address)
        row = next(row for row in root.find('m:sheetData', NS) if row.attrib['r'] == str(row_number))
        cell = ET.SubElement(row, f'{{{MAIN}}}c', {'r': address})
    clear_value(cell)
    if isinstance(value, (int, float)):
        ET.SubElement(cell, f'{{{MAIN}}}v').text = str(value)
    else:
        cell.attrib['t'] = 'inlineStr'
        inline = ET.SubElement(cell, f'{{{MAIN}}}is')
        ET.SubElement(inline, f'{{{MAIN}}}t').text = value


def mark(root, row, case_ids):
    for case_id in case_ids:
        set_cell(root, f'{col_name(4 + case_id)}{row}', 'O')


def add_condition_rows(root, count):
    if not count:
        return
    insert_at = 25
    sheet_data = root.find('m:sheetData', NS)
    rows = list(sheet_data)
    for row in reversed(rows):
        number = int(row.attrib['r'])
        if number >= insert_at:
            row.attrib['r'] = str(number + count)
            for cell in row:
                column, _ = split_cell(cell.attrib['r'])
                cell.attrib['r'] = f'{column}{number + count}'
    for element in root.iter():
        for attribute in ('ref', 'sqref'):
            if attribute in element.attrib:
                element.attrib[attribute] = ' '.join(update_rows(value, insert_at, count) for value in element.attrib[attribute].split())
    merges = root.find('m:mergeCells', NS)
    for merge in merges:
        if merge.attrib['ref'] == 'A10:A24':
            merge.attrib['ref'] = f'A10:A{24 + count}'
    base_row = next(row for row in sheet_data if row.attrib['r'] == '24')
    for number in range(insert_at, insert_at + count):
        clone = deepcopy(base_row)
        clone.attrib['r'] = str(number)
        for cell in clone:
            column, _ = split_cell(cell.attrib['r'])
            cell.attrib['r'] = f'{column}{number}'
            clear_value(cell)
        sheet_data.append(clone)
        merge = ET.SubElement(merges, f'{{{MAIN}}}mergeCell', {'ref': f'B{number}:D{number}'})
    merges.attrib['count'] = str(len(merges))
    sheet_data[:] = sorted(sheet_data, key=lambda row: int(row.attrib['r']))


def fill(root, matrix, extra_conditions):
    add_condition_rows(root, extra_conditions)
    offset = extra_conditions
    count = matrix['count']
    # Explicitly authorized bold header repairs and test-case headers.
    for address, value in [('E2', 'Function Name'), ('E3', 'Executed By'), ('E4', 'Lack of test case')]:
        set_cell(root, address, value)
    for number in range(1, count + 1):
        set_cell(root, f'{col_name(4 + number)}9', f'UTCID{number:02d}')

    values = {
        'C2': matrix['code'], 'K2': matrix['function'], 'C3': 'DatDT', 'K3': 'Jest',
        'C4': matrix['loc'], 'K4': 0, 'C5': matrix['requirement'], 'E10': matrix['precondition'],
        'A7': count, 'C7': 0, 'E7': 0, 'K7': matrix['types'].count('N'),
        'L7': matrix['types'].count('A'), 'M7': matrix['types'].count('B'), 'N7': count,
    }
    for address, value in values.items():
        set_cell(root, address, value)

    for row in range(11, 25 + extra_conditions):
        set_cell(root, f'B{row}', '')
        for number in range(1, count + 1):
            set_cell(root, f'{col_name(4 + number)}{row}', '')
    for row, (description, cases) in enumerate(matrix['conditions'], 11):
        set_cell(root, f'B{row}', description)
        mark(root, row, cases)

    return_start = 26 + offset
    exception_start = 30 + offset
    log_row = 33 + offset
    result_start = 35 + offset
    for index, (description, cases) in enumerate(matrix['return']):
        set_cell(root, f'B{return_start + index}', description)
        mark(root, return_start + index, cases)
    for index, (description, cases) in enumerate(matrix['exception']):
        set_cell(root, f'B{exception_start + index}', description)
        mark(root, exception_start + index, cases)
    set_cell(root, f'B{log_row}', 'No log message.')
    mark(root, log_row, range(1, count + 1))
    for number, test_type in enumerate(matrix['types'], 1):
        column = col_name(4 + number)
        set_cell(root, f'{column}{result_start}', test_type)
        set_cell(root, f'{column}{result_start + 1}', 'Passed')
        set_cell(root, f'{column}{result_start + 2}', '11/18')
        set_cell(root, f'{column}{result_start + 3}', '')


with zipfile.ZipFile(SOURCE) as source:
    entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    infos = {item.filename: item for item in source.infolist()}

workbook = ET.fromstring(entries['xl/workbook.xml'])
relationships = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
targets = {item.attrib['Id']: item.attrib['Target'] for item in relationships}

for sheet in workbook.find('m:sheets', NS):
    name = sheet.attrib['name']
    if name not in MATRICES:
        continue
    path = posixpath.normpath(posixpath.join('xl', targets[sheet.attrib[f'{{{REL}}}id']]))
    root = ET.fromstring(entries[path])
    fill(root, MATRICES[name], 1 if name == 'CURSOR-02_decode' else 8 if name == 'SHIFT-IN-03_invitationInput' else 0)
    entries[path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)

with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as destination:
    for filename, payload in entries.items():
        destination.writestr(deepcopy(infos[filename]), payload)

print(OUTPUT.resolve())
