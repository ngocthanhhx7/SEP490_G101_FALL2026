import mongoose from 'mongoose';

export class DatabaseStartupError extends Error {
  constructor(code = 'DB_CONNECTION_UNAVAILABLE') {
    super('Database connection or required topology unavailable');
    this.name = 'DatabaseStartupError'; this.code = code;
  }
}

export async function connectDatabase(config) {
  let connection;
  try {
    connection = mongoose.createConnection(config.mongoUri, {
      dbName: config.database, serverSelectionTimeoutMS: config.connectTimeoutMs,
      connectTimeoutMS: config.connectTimeoutMs, autoIndex: false, bufferCommands: false,
      maxPoolSize: 10
    });
    // Never log raw driver errors: they can contain credentials/hostnames.
    connection.on('error', () => {});
    await connection.asPromise();
    const hello = await connection.db.admin().command({ hello: 1 }, { timeoutMS: config.connectTimeoutMs });
    const build = await connection.db.admin().command({ buildInfo: 1 }, { timeoutMS: config.connectTimeoutMs });
    if (!hello.setName || !build.version.startsWith('8.0.')) throw new DatabaseStartupError('DB_TOPOLOGY_OR_VERSION_UNSUPPORTED');
    return connection;
  } catch (err) {
    await connection?.close().catch(() => {});
    if (err instanceof DatabaseStartupError) throw err;
    if (err.code === 18) throw new DatabaseStartupError('DB_AUTHENTICATION_FAILED');
    throw new DatabaseStartupError();
  }
}
