import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { identityModels } from '../../models/identity.model.js';
import { fail } from '../../validators/pet-care.validator.js';

export function createEmploymentPrefillService({ connection, crypto, lookupSecret }) {
  const { Contact } = identityModels(connection);
  async function contacts(userId) {
    if (!Types.ObjectId.isValid(userId)) return {};
    const rows = await Contact.find({ userId, state: 'VERIFIED' }).select('+canonicalCiphertext').sort({ verifiedAt: -1, _id: -1 }).limit(10).lean();
    const result = {};
    for (const row of rows) if (!result[row.channel]) result[row.channel] = crypto.decrypt(row.canonicalCiphertext);
    return result;
  }
  return {
    async get(actor, application) {
      const terms = {}, sources = {}, warnings = [];
      const put = (key, value, source) => { if (typeof value === 'string' && value.trim()) { terms[key] = value; sources[key] = source; } };
      const admin = await connection.collection('users').findOne({ _id: new Types.ObjectId(actor.userId), roles: 'ADMIN', state: 'ACTIVE', synthetic: { $ne: true } }, { projection: { displayName: 1 } });
      if (!admin) fail('FORBIDDEN', 'Current Admin required', 403);
      try {
        const [adminContacts, applicantContacts] = await Promise.all([contacts(actor.userId), contacts(application.ownerUserId ?? application.provisionedUserId)]);
        put('representativeName', admin.displayName, 'ADMIN_PROFILE');
        put('employerEmail', adminContacts.EMAIL, 'ADMIN_VERIFIED_CONTACT');
        put('employerPhone', adminContacts.PHONE, 'ADMIN_VERIFIED_CONTACT');
        put('employeeName', application.displayName, 'APPLICATION');
        put('employeeEmail', applicantContacts.EMAIL, 'APPLICANT_VERIFIED_CONTACT');
        put('employeePhone', applicantContacts.PHONE, 'APPLICANT_VERIFIED_CONTACT');
        if (application.contactCiphertext) put(application.contactChannel === 'EMAIL' ? 'employeeEmail' : 'employeePhone', crypto.decrypt(application.contactCiphertext), 'APPLICATION');
        if (application.applicantParticularsCiphertext) {
          const particulars = JSON.parse(crypto.decrypt(application.applicantParticularsCiphertext));
          if (typeof particulars.identityNumber !== 'string' || createHmac('sha256', lookupSecret).update('applicant-identity\0' + particulars.identityNumber).digest('hex') !== application.identityLookupKey)
            fail('CONTRACT_PREFILL_UNAVAILABLE', 'Applicant particulars cannot be verified', 503);
          put('identityNumber', particulars.identityNumber, 'APPLICATION_PRIVATE');
          put('dateOfBirth', particulars.dateOfBirth, 'APPLICATION_PRIVATE');
        } else warnings.push('Hồ sơ này chưa có ngày sinh và số giấy tờ gốc được lưu để điền sẵn. Đối chiếu giấy tờ và bổ sung các ô còn thiếu trước khi chốt bản in.');
      } catch (error) {
        if (error.code === 'CONTRACT_PREFILL_UNAVAILABLE') throw error;
        fail('CONTRACT_PREFILL_UNAVAILABLE', 'Private profile information temporarily unavailable', 503);
      }
      return { terms, sources, warnings };
    }
  };
}
