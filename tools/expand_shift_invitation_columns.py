from copy import deepcopy
from pathlib import Path
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

SOURCE = Path('Report5_Unit Test.source.xlsm')
OUTPUT = Path('Report5_Unit Test.shift-in-03-expanded.xlsm')
SHEET_NAME = 'SHIFT-IN-03_invitationInput'
INSERT_AT = 20  # Insert after the existing UTCID01–UTCID15 columns (E:S).
COUNT = 7
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN, 'r': REL}
ET.register_namespace('', MAIN)
ET.register_namespace('r', REL)


def column_number(name):
    value = 0
    for character in name:
        value = value * 26 + ord(character) - 64
    return value


def column_name(value):
    name = ''
    while value:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def shift_reference(reference):
    def replace(match):
        prefix, letters, row = match.groups()
        index = column_number(letters)
        return f'{prefix}{column_name(index + COUNT if index >= INSERT_AT else index)}{row}'

    return re.sub(r'(\$?)([A-Z]+)(\$?\d+)', replace, reference)


def copied_cell(row, source_column, target_column):
    source = next((cell for cell in row if cell.attrib.get('r') == f'{source_column}{row.attrib["r"]}'), None)
    if source is None:
        return None
    target = deepcopy(source)
    target.attrib['r'] = f'{target_column}{row.attrib["r"]}'
    for child in list(target):
        target.remove(child)
    target.attrib.pop('t', None)
    return target


with zipfile.ZipFile(SOURCE) as source:
    entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    infos = {item.filename: item for item in source.infolist()}

workbook = ET.fromstring(entries['xl/workbook.xml'])
relationships = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
targets = {item.attrib['Id']: item.attrib['Target'] for item in relationships}
sheet = next(item for item in workbook.find('m:sheets', NS) if item.attrib['name'] == SHEET_NAME)
sheet_path = posixpath.normpath(posixpath.join('xl', targets[sheet.attrib[f'{{{REL}}}id']]))
root = ET.fromstring(entries[sheet_path])

columns = root.find('m:cols', NS)
for column in reversed(list(columns)):
    minimum, maximum = int(column.attrib['min']), int(column.attrib['max'])
    if maximum >= INSERT_AT:
        column.attrib['min'] = str(minimum + COUNT if minimum >= INSERT_AT else minimum)
        column.attrib['max'] = str(maximum + COUNT)

base = next(column for column in columns if int(column.attrib['min']) <= 19 <= int(column.attrib['max']))
new_columns = deepcopy(base)
new_columns.attrib['min'] = str(INSERT_AT)
new_columns.attrib['max'] = str(INSERT_AT + COUNT - 1)
columns.append(new_columns)
columns[:] = sorted(columns, key=lambda column: int(column.attrib['min']))

sheet_data = root.find('m:sheetData', NS)
for row in sheet_data:
    existing = list(row)
    for cell in existing:
        match = re.fullmatch(r'([A-Z]+)(\d+)', cell.attrib['r'])
        if column_number(match.group(1)) >= INSERT_AT:
            cell.attrib['r'] = f'{column_name(column_number(match.group(1)) + COUNT)}{match.group(2)}'
    for offset in range(COUNT):
        source_column = 'R' if offset < COUNT - 1 else 'S'
        cell = copied_cell(row, source_column, column_name(INSERT_AT + offset))
        if cell is not None:
            row.append(cell)
    row[:] = sorted(row, key=lambda cell: column_number(re.match(r'[A-Z]+', cell.attrib['r']).group()))

for element in root.iter():
    for attribute in ('ref', 'sqref'):
        if attribute in element.attrib:
            element.attrib[attribute] = ' '.join(shift_reference(value) for value in element.attrib[attribute].split())

# The added test-case columns belong to the existing merged information/summary
# bands and to the three matrix dropdown ranges.
for merge in root.findall('m:mergeCells/m:mergeCell', NS):
    if merge.attrib['ref'] in {'K2:S2', 'K3:S3', 'K4:S4', 'C5:S5', 'N6:S6', 'N7:S7'}:
        merge.attrib['ref'] = merge.attrib['ref'].replace('S', 'Z')
for validation in root.findall('m:dataValidations/m:dataValidation', NS):
    validation.attrib['sqref'] = validation.attrib['sqref'].replace(':S', ':Z')

entries[sheet_path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)

with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as destination:
    for filename, payload in entries.items():
        destination.writestr(deepcopy(infos[filename]), payload)

print(OUTPUT.resolve())
