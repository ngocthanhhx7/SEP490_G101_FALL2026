// An approved application reserves an onboarding destination, not proof that
// the applicant owns it. Only a consumed LOGIN OTP may create a verified contact.
export function createApplicationOnboardingService({ connection }) {
  return { async findApproved({ channel, lookupKey, session }) {
    if (!connection?.db) return null;
    return connection.db.collection('sitterapplications').findOne({ state: 'APPROVED', ownerUserId: null,
      provisionedUserId: { $type: 'objectId' },
      ...(channel === 'EMAIL' ? { contactChannel: 'EMAIL', contactLookupKey: lookupKey } : { phoneLookupKey: lookupKey })
    }, { session, projection: { provisionedUserId: 1 } });
  } };
}
