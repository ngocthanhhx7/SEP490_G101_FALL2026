"""Exercise release failure/success ordering without touching Docker or EC2."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts/deployment'


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / 'shared').mkdir()
        self.sha = 'a' * 40
        self.old_sha = 'b' * 40
        release = self.root / 'releases' / self.sha
        release.mkdir(parents=True)
        (release / 'REVISION').write_text(self.sha)
        self.previous = {'revision': self.old_sha, 'slot': 'blue', 'port': 3000,
                         'container': 'pwc-api-blue', 'image': 'old-image'}
        self.state = self.root / 'shared/current-release.json'
        self.state.write_text(json.dumps(self.previous))

    def test_failed_candidate_keeps_previous_state_and_serving_container(self):
        module = load('activate-release')
        calls = []

        def run(*args, **_kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, stdout='')

        with patch.object(module, 'ROOT', self.root), patch.object(module, 'run', run), \
             patch.object(module.os, 'geteuid', create=True, return_value=0), \
             patch.object(sys, 'argv', ['activate-release.py', self.sha]), \
             patch.object(module.urllib.request, 'urlopen', side_effect=OSError('unavailable')), \
             patch.object(module.time, 'sleep'), \
             patch.object(Path, 'symlink_to', autospec=True, side_effect=lambda path, *args, **kwargs: path.write_text('synthetic-link')):
            with self.assertRaises(SystemExit):
                module.main()
        self.assertEqual(json.loads(self.state.read_text()), self.previous)
        self.assertNotIn(('docker', 'stop', '-t', '20', 'pwc-api-blue'), calls)
        self.assertIn(('docker', 'rm', '-f', 'pwc-api-green'), calls)
        self.assertTrue(any(call[0] == 'python3' and call[-2:] == (self.old_sha, '3000') for call in calls))

    def test_success_switches_web_before_stopping_previous_api(self):
        module = load('activate-release')
        calls = []

        def run(*args, **_kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, stdout='')

        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(module, 'ROOT', self.root), patch.object(module, 'run', run), \
             patch.object(module.os, 'geteuid', create=True, return_value=0), \
             patch.object(sys, 'argv', ['activate-release.py', self.sha]), \
             patch.object(module.urllib.request, 'urlopen', return_value=response), \
             patch.object(module.time, 'sleep'), \
             patch.object(Path, 'symlink_to', autospec=True, side_effect=lambda path, *args, **kwargs: path.write_text('synthetic-link')):
            module.main()
        web = next(i for i, call in enumerate(calls) if call[0] == 'python3')
        stop = calls.index(('docker', 'stop', '-t', '20', 'pwc-api-blue'))
        self.assertLess(web, stop)
        self.assertEqual(json.loads(self.state.read_text())['revision'], self.sha)

    def test_bad_revision_never_calls_docker(self):
        module = load('activate-release')
        with patch.object(module.os, 'geteuid', create=True, return_value=0), \
             patch.object(sys, 'argv', ['activate-release.py', '../shared']), \
             patch.object(module, 'run') as run:
            with self.assertRaises(SystemExit):
                module.main()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
