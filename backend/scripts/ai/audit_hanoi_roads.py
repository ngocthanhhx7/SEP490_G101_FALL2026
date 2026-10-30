"""Audit an operator-supplied public OSM extract; requires osmium==4.3.2.

No downloads, customer coordinates, training labels or application/database writes.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import osmium


class RoadAudit(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.highways = Counter()
        self.tag_presence = Counter()
        self.restrictions = Counter()
        self.nodes = 0
        self.ways = 0

    def node(self, _node):
        self.nodes += 1

    def way(self, way):
        self.ways += 1
        if "highway" not in way.tags:
            return
        self.highways[way.tags["highway"]] += 1
        for key in ("oneway", "maxspeed", "access", "vehicle", "motor_vehicle", "motorcycle", "surface"):
            if key in way.tags:
                self.tag_presence[key] += 1

    def relation(self, relation):
        if relation.tags.get("type") == "restriction":
            self.restrictions[relation.tags.get("restriction", "conditional-or-mode-specific")] += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Use a new immutable audit path")
    digest = hashlib.sha256()
    with args.source.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    handler = RoadAudit()
    handler.apply_file(str(args.source))
    if not handler.highways or not handler.restrictions:
        raise ValueError("No routable road/restriction evidence; inspect extract")
    report = {"sourceSha256": digest.hexdigest(), "bytes": args.source.stat().st_size,
              "auditedAt": datetime.now(timezone.utc).isoformat(), "nodes": handler.nodes, "ways": handler.ways,
              "highwayCounts": dict(handler.highways), "tagPresence": dict(handler.tag_presence),
              "restrictionCounts": dict(handler.restrictions),
              "attribution": "OpenStreetMap contributors / ODbL", "groundTruthTravelTimes": False,
              "limits": "Tag presence is not completeness, connectivity, legal-mode or ETA accuracy verification"}
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
