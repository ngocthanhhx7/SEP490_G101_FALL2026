import { Schema, oid, registerModels } from './model-definitions.js';
export function decisionSnapshotModels(connection) {
  return registerModels(connection, {
    DecisionSnapshot: {
      fields: {
        ownerId: { type: oid, required: true, index: true },
        kind: { type: String, enum: ['QUOTE', 'MATCH'], required: true },
        requestHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        snapshot: { type: Schema.Types.Mixed, required: true, select: false }
      },
      indexes: [
        [{ ownerId: 1, kind: 1, createdAt: -1 }, {}],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]
      ]
    }
  });
}
