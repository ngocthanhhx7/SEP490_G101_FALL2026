import { groomingModels } from '../../models/grooming-appointment.model.js';
import { GROOMING_CODE_COUNTER_ID, GROOMING_CODE_PREFIX } from '../../constants/grooming.js';

// Allocated outside the booking transaction, like the product order code: a failed booking may leave a gap in GR numbers,
// and the unique index on `code` is the last guard.
export function createGroomingAppointmentCode({ connection }) {
  const { GroomingCounter } = groomingModels(connection);
  const next = () => GroomingCounter.findOneAndUpdate({ _id: GROOMING_CODE_COUNTER_ID }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
  return {
    async nextCode() {
      let counter;
      try {
        counter = await next();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        counter = await next();
      }
      return `${GROOMING_CODE_PREFIX}${String(counter.value).padStart(4, '0')}`;
    }
  };
}
