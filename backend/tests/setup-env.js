import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.MONGOMS_DOWNLOAD_DIR ??= path.join(process.cwd(), '.cache', 'mongodb-binaries');
