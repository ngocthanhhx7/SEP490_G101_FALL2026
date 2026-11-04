import { oid, integer, registerModels } from './model-definitions.js';

export function productPhotoModels(connection) {
  return registerModels(connection, { ProductPhoto: {
    fields: {
      productId: { type: oid, required: true },
      digest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
      content: { type: Buffer, required: true, select: false },
      byteLength: { ...integer(1, 1024 * 1024), required: true },
      width: { ...integer(1, 1600), required: true },
      height: { ...integer(1, 1600), required: true },
      uploadedBy: { type: oid, required: true }
    },
    indexes: [[{ productId: 1, digest: 1 }, { unique: true }]]
  } });
}
