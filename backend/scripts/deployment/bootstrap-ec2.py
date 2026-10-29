#!/usr/bin/env python3
"""Initialise a new EC2 host. Run as root; never prints generated credentials.

Requires Docker, Python 3 and pre-pulled mongo:8.0. Existing volumes/secrets are
retained. MongoDB must stay on loopback; a single-node replica set enables the
application's transactions but does not provide high availability.
"""
import base64
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path('/opt/pawworldcare')
SHARED = ROOT / 'shared'


def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def private_file(path, content):
    if path.exists():
        return
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run using sudo')
    SHARED.mkdir(parents=True, exist_ok=True)
    SHARED.chmod(0o700)
    (ROOT / 'backups').mkdir(exist_ok=True, mode=0o700)
    private_file(SHARED / 'mongo.env', '\n'.join([
        'MONGO_INITDB_ROOT_USERNAME=pwcadmin',
        'MONGO_INITDB_ROOT_PASSWORD=' + secrets.token_hex(32),
        'PWC_APP_PASSWORD=' + secrets.token_hex(32), ''
    ]))
    values = dict(line.split('=', 1) for line in
                  (SHARED / 'mongo.env').read_text().splitlines() if '=' in line)
    private_file(SHARED / 'mongo-keyfile', base64.b64encode(secrets.token_bytes(512)).decode())
    os.chown(SHARED / 'mongo-keyfile', 999, 999)
    (SHARED / 'mongo-keyfile').chmod(0o400)
    private_file(SHARED / '.env', '\n'.join([
        'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=3000',
        'MONGO_URI=mongodb://pwcapp:' + values['PWC_APP_PASSWORD'] +
        '@127.0.0.1:27017/paw_world_care?authSource=paw_world_care&replicaSet=rs0&directConnection=true',
        'MONGO_DB=paw_world_care', 'MONGO_CONNECT_TIMEOUT_MS=10000',
        'READINESS_TIMEOUT_MS=2000', 'SHUTDOWN_TIMEOUT_MS=10000',
        'TRUST_PROXY_HOPS=1', 'RATE_LIMIT_WINDOW_MS=60000', 'RATE_LIMIT_MAX=100',
        'ALLOW_DEV_ADMIN_SEED=false', 'AUTH_ENABLED=true',
        *[name + '=' + secrets.token_hex(32) for name in [
            'OTP_HMAC_SECRET', 'SESSION_TOKEN_SECRET', 'SESSION_CSRF_SECRET',
            'CONTACT_LOOKUP_SECRET']],
        'CONTACT_ENCRYPTION_KEY=' + secrets.token_hex(16),
        'EMAIL_ENABLED=false', 'SMTP_HOST=', 'SMTP_PORT=587', 'SMTP_USER=',
        'SMTP_PASSWORD=', 'EMAIL_FROM=', 'CONTACT_INBOX_EMAIL=',
        'SMS_ENABLED=false', 'ESMS_API_KEY=', 'ESMS_SECRET_KEY=', 'ESMS_BRANDNAME=',
        'ESMS_OTP_TEMPLATE=Ma xac nhan cua ban la {code}',
        'AI_ENABLED=false', 'AI_ROUTING_URL=',
        '# Reserved for the R2 adapter; empty values do not enable image storage.',
        'R2_ENABLED=false', 'R2_ACCOUNT_ID=', 'R2_BUCKET=',
        'R2_ACCESS_KEY_ID=', 'R2_SECRET_ACCESS_KEY=', 'R2_MAX_IMAGES_PER_USER=20', ''
    ]))
    if run('docker', 'container', 'ls', '-a', '--filter', 'name=^pwc-mongo$',
           '--format', '{{.Names}}', capture=True).stdout.strip() != 'pwc-mongo':
        digest = run('docker', 'image', 'inspect', 'mongo:8.0', '--format',
                     '{{index .RepoDigests 0}}', capture=True).stdout.strip()
        run('docker', 'run', '-d', '--name', 'pwc-mongo', '--restart', 'unless-stopped',
            '--network', 'host', '--memory', '768m', '--log-opt', 'max-size=10m',
            '--log-opt', 'max-file=3', '--env-file', str(SHARED / 'mongo.env'),
            '-v', 'pwc-mongo-data:/data/db',
            '-v', str(SHARED / 'mongo-keyfile') + ':/run/mongo-keyfile:ro',
            digest, '--bind_ip', '127.0.0.1', '--port', '27017',
            '--replSet', 'rs0', '--keyFile', '/run/mongo-keyfile',
            '--wiredTigerCacheSizeGB', '0.25')
    else:
        run('docker', 'start', 'pwc-mongo')
    # Credentials are read inside mongosh from its container environment.
    prefix = "const c=new Mongo('mongodb://'+encodeURIComponent(process.env.MONGO_INITDB_ROOT_USERNAME)+':'+encodeURIComponent(process.env.MONGO_INITDB_ROOT_PASSWORD)+'@127.0.0.1:27017/admin?directConnection=true');const a=c.getDB('admin');"
    initiate = prefix + "try{a.runCommand({replSetGetStatus:1})}catch(e){if(e.code!==94)throw e;const r=a.runCommand({replSetInitiate:{_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}});if(r.ok!==1)throw Error('Replica set unavailable')}"
    for attempt in range(60):
        result = subprocess.run(['docker', 'exec', 'pwc-mongo', 'mongosh', '--quiet',
                                 '--eval', initiate], capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(2)
    else:
        raise SystemExit('Mongo bootstrap unavailable; inspect local container logs')
    create = prefix + "if(!a.runCommand({hello:1}).isWritablePrimary)quit(2);const d=c.getDB('paw_world_care');if(!d.getUser('pwcapp'))d.createUser({user:'pwcapp',pwd:process.env.PWC_APP_PASSWORD,roles:[{role:'readWrite',db:'paw_world_care'}]});print('Database and application user ready');"
    for attempt in range(30):
        result = subprocess.run(['docker', 'exec', 'pwc-mongo', 'mongosh', '--quiet',
                                 '--eval', create], capture_output=True)
        if result.returncode == 0:
            print('MongoDB ready; credentials retained in root-only shared files')
            return
        time.sleep(2)
    raise SystemExit('Mongo primary/user unavailable; inspect local container logs')


if __name__ == '__main__':
    main()
