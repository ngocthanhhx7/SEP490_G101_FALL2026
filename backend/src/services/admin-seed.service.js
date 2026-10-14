import { AppError } from '../utils/app-error.js';
import { userModel } from '../models/user.model.js';

export async function seedDevelopmentAdmin(connection, config) {
  if (config.nodeEnv !== 'development' || !config.allowDevAdminSeed || !config.database.endsWith('_dev')) {
    throw new AppError(403, 'SEED_FORBIDDEN', 'Synthetic seed requires explicit development database opt-in');
  }
  const User = userModel(connection);
  await User.createIndexes();
  const user = await User.findOneAndUpdate({ fixtureKey: 'pwc-synthetic-admin-v1' }, {
    $setOnInsert: { displayName: 'Synthetic Admin (Development Only)', roles: ['ADMIN'], state: 'LOCKED',
      synthetic: true, authEpoch: 0, version: 0 }
  }, { upsert: true, returnDocument: 'after', runValidators: true });
  if (!user.synthetic || user.state !== 'LOCKED' || user.roles.length !== 1 || user.roles[0] !== 'ADMIN') {
    throw new AppError(409, 'SEED_FIXTURE_CONFLICT', 'Existing fixture cannot be treated as a safe synthetic admin');
  }
  return user;
}
