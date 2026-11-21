from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

path = Path('Report5_Unit Test.source.xlsm')
ns = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
with zipfile.ZipFile(path) as archive:
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    targets = {item.attrib['Id']: item.attrib['Target'] for item in relationships}
    for sheet in workbook.find('m:sheets', ns):
        relationship_id = sheet.attrib[f"{{{ns['r']}}}id"]
        print(f"{sheet.attrib['name']}|{sheet.attrib.get('sheetId')}|{targets[relationship_id]}")
