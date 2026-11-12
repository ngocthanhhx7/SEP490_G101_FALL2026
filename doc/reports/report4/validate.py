"""Validate the SDS artifact contracts without running application code or a DB."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET


def validate(base=None):
    base = Path(base or Path(__file__).resolve().parent)
    repository = base.parents[2]
    errors = []
    files = sorted(base.rglob('*.drawio'))
    pages = 0
    cells = 0
    for file in files:
        document = ET.parse(file).getroot()
        for diagram in document.findall('diagram'):
            pages += 1
            nodes = diagram.findall('.//mxCell')
            cells += len(nodes)
            ids = [node.get('id') for node in nodes]
            if len(ids) != len(set(ids)):
                errors.append(f'{file.name}: duplicate cell ID')
            for node in nodes:
                for key in ('parent', 'source', 'target'):
                    if node.get(key) and node.get(key) not in ids:
                        errors.append(f'{file.name}: unresolved {key}')
                geometry = node.find('mxGeometry')
                if geometry is not None:
                    for key in ('width', 'height'):
                        if geometry.get(key) and float(geometry.get(key)) < 0:
                            errors.append(f'{file.name}: negative {key}')
    cases = json.loads((base / 'use-case-traceability.json').read_text(encoding='utf8'))
    if [case['id'] for case in cases] != [f'UC-{n:02}' for n in range(1, 96)]:
        errors.append('SRS UC-01 through UC-95 must appear once and in order')
    for case in cases:
        if not (base / case['diagram']).is_file():
            errors.append(f'{case["id"]}: missing diagram')
        for source in case['sources']:
            if not (repository / source).is_file():
                errors.append(f'{case["id"]}: missing source {source}')
    schema = json.loads((base / 'schema-inventory.json').read_text(encoding='utf8'))
    if len(schema['models']) != 103 or len({m['collection'] for m in schema['models']}) != 103:
        errors.append('Expected 93 reflected models + 10 repository-managed collection contracts')
    for model in schema['models']:
        if not (repository / model['source']).is_file():
            errors.append(f'{model["name"]}: missing source')
        if not model['fields']:
            errors.append(f'{model["name"]}: missing field description')
    sections = json.loads((base / 'detailed-design-sections.json').read_text(encoding='utf8'))
    if [section['number'] for section in sections] != list(range(4, 23)):
        errors.append('Detailed Code Design sections 4 through 22 are incomplete')
    covered = {case for section in sections for case in section['useCases']}
    covered.update({'UC-16', 'UC-17', 'UC-18', 'UC-19', 'UC-21'})  # existing section 3
    if covered != {f'UC-{n:02}' for n in range(1, 96)}:
        errors.append('Detailed Code Design section mapping does not cover all 95 UC')
    extras = json.loads((base / 'supplemental-flow-traceability.json').read_text(encoding='utf8'))
    for section in sections:
        if not (base / section['classDiagram']).is_file():
            errors.append(f'{section["number"]}: missing class diagram')
    for flow in extras:
        if not (base / flow['diagram']).is_file():
            errors.append(f'{flow["id"]}: missing supplemental sequence')
    for file in base.rglob('*.md'):
        for link in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf8')):
            if re.match(r'^[a-z]+://', link):
                continue
            target = link.split('#', 1)[0]
            if target and not (file.parent / target).exists():
                errors.append(f'{file.name}: broken local link {link}')
    result = {'nativeFiles': len(files), 'pagesIncludingCombinedCopies': pages,
              'cells': cells, 'useCases': len(cases), 'schemaCollections': len(schema['models']),
              'additionalDesignSections': len(sections), 'supplementalFlows': len(extras),
              'errors': errors, 'status': 'PASS' if not errors else 'FAIL'}
    return result


if __name__ == '__main__':
    result = validate()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['status'] == 'PASS' else 1)
