import importlib.util
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location('pwc_weather_context', Path(__file__).resolve().parents[2]/'scripts'/'ai'/'collect_weather_context.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WeatherContextTests(unittest.TestCase):
    def payload(self):
        return {'utc_offset_seconds': 25200, 'timezone': 'Asia/Ho_Chi_Minh', 'hourly': {
            'time': [(datetime(2025, 1, 1)+timedelta(hours=i)).isoformat() for i in range(24)],
            **{name: [1.0]*24 for name in module.VARIABLES}}}

    def test_reports_missing_values_without_inventing_them(self):
        payload = self.payload()
        payload['hourly']['precipitation'][0] = None
        report = module.inspect(payload, date(2025, 1, 1), date(2025, 1, 1))
        self.assertEqual(report['hourlyRows'], 24)
        self.assertEqual(report['columns']['precipitation']['missing'], 1)

    def test_rejects_gaps_duplicates_and_nonfinite_numbers(self):
        for kind in ['gap', 'duplicate', 'nan']:
            payload = self.payload()
            if kind == 'gap':
                payload['hourly']['time'].pop()
            elif kind == 'duplicate':
                payload['hourly']['time'][1] = payload['hourly']['time'][0]
            else:
                payload['hourly']['temperature_2m'][0] = float('nan')
            with self.assertRaises(ValueError):
                module.inspect(payload, date(2025, 1, 1), date(2025, 1, 1))
