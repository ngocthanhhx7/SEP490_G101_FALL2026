#!/usr/bin/env python3
"""Clip public OSM input with full references and turn restrictions.

Requires separately installed osmium==4.3.2. No downloads, credentials or deployment.
Usage: python extract-hanoi-routing.py SOURCE.osm.pbf NEW_OUTPUT.osm.pbf
"""
import hashlib
import json
from pathlib import Path
import sys
import osmium

BOUNDS = (105.15, 20.45, 106.15, 21.55)


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Supply source and new output .osm.pbf paths')
    source, output = map(Path, sys.argv[1:])
    if not source.is_file() or output.exists() or source.resolve() == output.resolve():
        raise SystemExit('Source must exist; output must be new')
    selected = set()
    counts = {'restrictions': 0}
    with osmium.BackReferenceWriter(str(output), ref_src=str(source), remove_tags=False) as writer:
        class Ways(osmium.SimpleHandler):
            def way(self, way):
                if 'highway' not in way.tags and way.tags.get('route') != 'ferry':
                    return
                if any(node.location.valid() and BOUNDS[0] <= node.lon <= BOUNDS[2]
                       and BOUNDS[1] <= node.lat <= BOUNDS[3] for node in way.nodes):
                    selected.add(way.id)
                    writer.add_way(way)

        Ways().apply_file(str(source), locations=True, idx='flex_mem')

        class Restrictions(osmium.SimpleHandler):
            def relation(self, relation):
                if relation.tags.get('type') == 'restriction' and any(
                        member.type == 'w' and member.ref in selected for member in relation.members):
                    writer.add_relation(relation)
                    counts['restrictions'] += 1

        Restrictions().apply_file(str(source))

    class Verify(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.nodes = self.ways = self.invalid = 0

        def node(self, node):
            self.nodes += 1

        def way(self, way):
            self.ways += 1
            self.invalid += sum(not node.location.valid() for node in way.nodes)

    verify = Verify()
    verify.apply_file(str(output), locations=True, idx='flex_mem')
    if not selected or not counts['restrictions'] or verify.invalid:
        raise SystemExit('Routing reference/coverage verification failed; do not deploy output')

    def sha256(path):
        digest = hashlib.sha256()
        with path.open('rb') as file:
            while chunk := file.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest()

    manifest = {'sourceSha256': sha256(source), 'sha256': sha256(output),
                'bounds': BOUNDS, 'boundsMeaning': 'Buffered routing rectangle, not administrative coverage',
                'bytes': output.stat().st_size, 'nodes': verify.nodes, 'ways': verify.ways,
                'restrictions': counts['restrictions'], 'invalidNodeReferences': verify.invalid,
                'attribution': 'OpenStreetMap contributors / ODbL; source supplied by operator'}
    output.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
