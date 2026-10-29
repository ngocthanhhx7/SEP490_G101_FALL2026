#!/usr/bin/env python3
"""Build and activate a verified full-SHA release. Run as root on EC2.

Secrets and database volumes remain outside releases. Does not drop databases,
seed demo accounts, change DNS, or change AWS security groups.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/opt/pawworldcare')


def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run using sudo')
    revision = sys.argv[1] if len(sys.argv) == 2 else ''
    if not re.fullmatch('[a-f0-9]{40}', revision):
        raise SystemExit('Supply the full verified Git SHA')
    release = ROOT / 'releases' / revision
    if (release / 'REVISION').read_text().strip() != revision:
        raise SystemExit('Release manifest does not match expected SHA')
    image = 'pawworldcare-backend:' + revision
    state_path = ROOT / 'shared/current-release.json'
    previous = json.loads(state_path.read_text()) if state_path.exists() else None
    slot = 'green' if previous and previous['slot'] == 'blue' else 'blue'
    port = 3001 if slot == 'green' else 3000
    container = 'pwc-api-' + slot
    run('docker', 'build', '-t', image, '-f',
        str(release / 'backend/scripts/deployment/Dockerfile'), str(release / 'backend'))
    base = ['docker', 'run', '--network', 'host', '--env-file',
            str(ROOT / 'shared/.env'), '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '384m']
    run(*base, '--rm', image, 'node', 'scripts/deployment/ensure-indexes.js')
    stale = run('docker', 'ps', '-a', '--filter', 'name=^' + container + '$',
                '--format', '{{.Names}}', capture=True).stdout.strip()
    if stale:
        run('docker', 'rm', '-f', container)  # Inactive slot only; previous is untouched.
    try:
        run(*base, '-e', 'PORT=' + str(port), '-d', '--name', container,
            '--restart', 'unless-stopped', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3', image)
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/ready', timeout=3) as response:
                    if response.status == 200:
                        break
            except (OSError, ValueError):
                pass
            time.sleep(2)
        else:
            raise RuntimeError('Candidate readiness failed')
        # One Caddy reload changes frontend root and API upstream together.
        run('python3', str(release / 'backend/scripts/deployment/start-web.py'), revision, str(port))
        next_link = ROOT / 'current-next'
        if next_link.is_symlink():
            next_link.unlink()
        next_link.symlink_to(release, target_is_directory=True)
        next_link.replace(ROOT / 'current')
        if previous:
            (ROOT / 'shared/previous-release.json').write_text(json.dumps(previous) + '\n')
        state_next = state_path.with_suffix('.next')
        state_next.write_text(json.dumps({
            'revision': revision, 'image': image, 'slot': slot, 'port': port,
            'container': container, 'readiness': 'PASS'
        }) + '\n')
        state_next.replace(state_path)
    except Exception:
        if previous:
            old = ROOT / 'releases' / previous['revision']
            run('python3', str(old / 'backend/scripts/deployment/start-web.py'),
                previous['revision'], str(previous['port']))
            restore_link = ROOT / 'current-restore'
            if restore_link.is_symlink():
                restore_link.unlink()
            restore_link.symlink_to(old, target_is_directory=True)
            restore_link.replace(ROOT / 'current')
        elif (ROOT / 'current').is_symlink():
            (ROOT / 'current').unlink()
        run('docker', 'rm', '-f', container)
        raise SystemExit('Activation failed; previous serving release was retained') from None
    if previous:
        run('docker', 'stop', '-t', '20', previous['container'])
    print('Release active and readiness passed: ' + revision)


if __name__ == '__main__':
    import fcntl
    with open(ROOT / 'shared/deploy.lock', 'a') as deployment_lock:
        os.chmod(ROOT / 'shared/deploy.lock', 0o600)
        try:
            fcntl.flock(deployment_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another deployment is running') from None
        main()
