import { ACCOUNT_ROLES } from '../constants/account-roles.js';

// Keep the existing roles field/API shape; exactly one stored role is permitted.
// Historical audit role snapshots are deliberately outside this contract.
function roleStorageOptions(roles) {
  return Object.freeze({
    validator: { $jsonSchema: { bsonType: 'object', required: ['roles'], properties: {
      roles: { bsonType: 'array', minItems: 1, maxItems: 1, items: { enum: [...roles] } }
    } } },
    validationLevel: 'strict', validationAction: 'error'
  });
}

export const singleAccountRoleOptions = roleStorageOptions(ACCOUNT_ROLES);
export const previousSingleAccountRoleOptions = roleStorageOptions(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);
