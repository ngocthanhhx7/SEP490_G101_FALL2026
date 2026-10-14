export function createUnitOfWork(connection) {
  return Object.freeze({
    run: callback => connection.transaction(callback, {
      readPreference: 'primary', readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    })
  });
}
