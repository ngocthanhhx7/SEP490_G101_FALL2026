import { Customer } from '../models/customer.js';
import { PetSitterApplication } from '../models/pet-sitter-application.js';
import { findAuthSessionByToken } from '../services/login-services.js';

export async function optionalAuthentication(request, _response, next) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.get('authorization') ?? '');
  if (!match) return next();

  try {
    const session = await findAuthSessionByToken(match[1]);
    if (!session) return next();
    const isApplicant = session.principalType === 'PET_SITTER_APPLICANT';
    const principal = isApplicant
      ? await PetSitterApplication.findOne({
        _id: session.petSitterApplicationId,
        status: 'SUBMITTED_FOR_REVIEW',
        emailVerifiedAt: { $ne: null },
      }).select('_id fullName status submittedAt')
      : await Customer.findOne({ _id: session.customerId, status: 'ACTIVE' }).select('_id fullName roleId');
    if (!principal) return next();

    request.auth = { userId: String(principal._id), principalType: isApplicant ? 'PET_SITTER_APPLICANT' : 'CUSTOMER', sessionId: String(session._id) };
    request.authSessionId = session._id;
    request.user = {
      userId: String(principal._id),
      fullName: principal.fullName,
      roleId: isApplicant ? null : principal.roleId,
      accountType: isApplicant ? 'PET_SITTER_APPLICANT' : 'CUSTOMER',
      applicationStatus: isApplicant ? principal.status : null,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
