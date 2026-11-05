"""Collect bounded public ERA5 research context, never ranker labels or live features."""
import argparse
import hashlib
import json
import math
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

VARIABLES = ('temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m')
SOURCE = 'https://open-meteo.com/en/docs/historical-weather-api'
LICENSE = 'https://open-meteo.com/en/license'


def inspect(payload, start, end):
    expected = ((end-start).days+1)*24
    hourly = payload.get('hourly', {})
    times = hourly.get('time', [])
    if payload.get('utc_offset_seconds') != 25200 or payload.get('timezone') != 'Asia/Ho_Chi_Minh':
        raise ValueError('Vietnam timezone required')
    if len(times) != expected or len(set(times)) != expected:
        raise ValueError('Missing or duplicated hourly timestamps')
    parsed = [datetime.fromisoformat(value) for value in times]
    if parsed[0].date() != start or parsed[-1].date() != end or any((b-a).total_seconds() != 3600 for a, b in zip(parsed, parsed[1:])):
        raise ValueError('Non-contiguous hourly timestamps')
    result = {}
    for name in VARIABLES:
        values = hourly.get(name)
        if not isinstance(values, list) or len(values) != expected:
            raise ValueError('Missing weather column')
        valid = [v for v in values if v is not None]
        if any(type(v) not in (float, int) or not math.isfinite(v) for v in valid):
            raise ValueError('Invalid weather value')
        result[name] = {'rows': len(values), 'missing': expected-len(valid), 'min': min(valid) if valid else None, 'max': max(valid) if valid else None}
    return {'hourlyRows': expected, 'columns': result}


def collect(output, start, end):
    if end >= date.today() or not 1 <= (end-start).days+1 <= 366:
        raise ValueError('Choose 1 to 366 completed historical days')
    query = {'latitude': 21.0285, 'longitude': 105.8542, 'start_date': start.isoformat(), 'end_date': end.isoformat(), 'hourly': ','.join(VARIABLES), 'timezone': 'Asia/Ho_Chi_Minh', 'models': 'era5'}
    url = 'https://archive-api.open-meteo.com/v1/archive?' + urlencode(query)
    if output.exists():
        raise ValueError('Output exists; preserve immutable collection')
    with urlopen(Request(url, headers={'Accept': 'application/json', 'User-Agent': 'PawWorldCare-context-research/1'}), timeout=30) as response:
        raw = response.read(5_000_001)
    if len(raw) > 5_000_000:
        raise ValueError('Weather response exceeds 5 MB')
    payload = json.loads(raw)
    summary = inspect(payload, start, end)
    manifest = {'kind': 'PWC_PUBLIC_CONTEXT_V1', 'sourceUrl': SOURCE, 'requestUrl': url, 'licenseUrl': LICENSE, 'license': 'CC-BY-4.0', 'attribution': 'Weather data by Open-Meteo.com (https://open-meteo.com/), ERA5 reanalysis; CC BY 4.0', 'model': 'ERA5', 'requestedPoint': {'latitude': 21.0285, 'longitude': 105.8542}, 'returnedPoint': {'latitude': payload.get('latitude'), 'longitude': payload.get('longitude')}, 'collectedAt': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'summary': summary, 'rankTrainingEligible': False, 'productionFeatureEligible': False, 'status': 'QUARANTINED_RESEARCH_ONLY', 'limitations': ['Reanalysis, not a measured sitter journey or customer review', 'Availability at dispatch time is not proven', 'One grid cell cannot represent all Hanoi districts', 'No weather-to-delay or pet-health causal coefficient inferred']}
    output.mkdir(parents=True, exist_ok=False)
    (output/'weather.json').write_bytes(raw)
    (output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--start', type=date.fromisoformat, required=True)
    parser.add_argument('--end', type=date.fromisoformat, required=True)
    args = parser.parse_args()
    print(json.dumps(collect(args.output, args.start, args.end)))
