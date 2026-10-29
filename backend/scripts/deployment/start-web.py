#!/usr/bin/env python3
"""Expose a ready release with Caddy; certificates persist across releases."""
from pathlib import Path
import ipaddress
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/opt/pawworldcare')


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run using sudo')
    revision = sys.argv[1] if len(sys.argv) == 3 else ''
    port = sys.argv[2] if len(sys.argv) == 3 else ''
    if not re.fullmatch('[a-f0-9]{40}', revision) or port not in ['3000', '3001']:
        raise SystemExit('Supply a full SHA and slot port 3000 or 3001')
    release = (ROOT / 'releases' / revision).resolve(strict=True)
    if release.parent != ROOT / 'releases' or not (release / 'frontend/dist/index.html').is_file():
        raise SystemExit('Unexpected release path')
    # Validate before replacing a working web container.
    image = 'caddy:2@sha256:5e5286cb37d44086d651a5363f05f43a692ce4d649d88fb1bd844579f45fa9e8'
    web = ROOT / 'web'
    web.mkdir(exist_ok=True)
    config = web / 'Caddyfile'
    prior = config.read_text() if config.exists() else None
    # Only official Cloudflare networks may supply CF-Connecting-IP. A direct
    # request with forged forwarding headers must retain its TCP client address.
    ranges = []
    for endpoint in ['https://www.cloudflare.com/ips-v4', 'https://www.cloudflare.com/ips-v6']:
        with urllib.request.urlopen(endpoint, timeout=10) as response:
            ranges.extend(str(ipaddress.ip_network(line.strip())) for line in
                          response.read(65536).decode().splitlines() if line.strip())
    if not ranges:
        raise SystemExit('Cloudflare proxy ranges unavailable')
    global_config = '{\n servers {\n trusted_proxies static ' + ' '.join(ranges) + '\n trusted_proxies_strict\n client_ip_headers CF-Connecting-IP\n }\n}\n'
    template = (release / 'backend/scripts/deployment/Caddyfile').read_text()
    rendered = global_config + template.replace('/srv/frontend', '/srv/releases/' + revision + '/frontend/dist').replace('127.0.0.1:3000', '127.0.0.1:' + port)
    next_config = web / 'Caddyfile.next'
    next_config.write_text(rendered)
    mounts = ['-v', str(web) + ':/etc/caddy:ro', '-v',
              str(ROOT / 'releases') + ':/srv/releases:ro',
              '-v', 'pwc-caddy-data:/data', '-v', 'pwc-caddy-config:/config']
    subprocess.run(['docker', 'run', '--rm', *mounts, image, 'caddy', 'validate',
                    '--config', '/etc/caddy/Caddyfile.next', '--adapter', 'caddyfile'], check=True)
    exists = subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^pwc-web$',
                             '--format', '{{.Names}}'], capture_output=True, text=True, check=True).stdout.strip()
    next_config.replace(config)
    try:
        if exists:
            subprocess.run(['docker', 'start', 'pwc-web'], check=True)
            subprocess.run(['docker', 'exec', 'pwc-web', 'caddy', 'reload',
                            '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True)
        else:
            subprocess.run(['docker', 'run', '-d', '--name', 'pwc-web', '--restart', 'unless-stopped',
                            '--network', 'host', '--memory', '192m', '--log-opt', 'max-size=10m',
                            '--log-opt', 'max-file=3', *mounts, image], check=True)
        for attempt in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8080/ready', timeout=3) as response:
                    if response.status == 200:
                        break
            except OSError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError('Web readiness failed')
    except Exception:
        if prior is not None:
            config.write_text(prior)
            subprocess.run(['docker', 'exec', 'pwc-web', 'caddy', 'reload',
                            '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True)
        else:
            subprocess.run(['docker', 'rm', '-f', 'pwc-web'], check=False, capture_output=True)
        raise


if __name__ == '__main__':
    main()
