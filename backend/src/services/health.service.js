export function createHealthService(connection, lifecycle, timeoutMs) {
  return {
    health: () => ({ status: 'alive' }),
    readiness: async () => {
      if (lifecycle.draining || connection.readyState !== 1 || !connection.db) return false;
      try {
        await connection.db.admin().command({ ping: 1 }, { timeoutMS: timeoutMs });
        return !lifecycle.draining && connection.readyState === 1;
      } catch { return false; }
    }
  };
}
