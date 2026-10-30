import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createCustomerRegistrationHandler } from '../services/customer-registration.service.js';
import { createOtpService } from '../services/otp-verification.service.js';
import { createSessionService } from '../services/session.service.js';
import { createAccountSettingsService } from '../services/account-settings.service.js';
import { createRegistrationPolicyService } from '../services/registration-policy.service.js';
import { requireCsrf, requireSession } from '../middlewares/session.js';
import { authModule } from './auth.routes.js';

export function authenticationModule({ config, connection, ports, logger = () => {}, clock = Date.now }) {
  if (!config.auth?.enabled) return null;

  const sessionService = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const accountSettingsService = createAccountSettingsService({ connection, contactCrypto });
  const registrationPolicyService = createRegistrationPolicyService({ connection, clock });
  const registerHandler = createCustomerRegistrationHandler({
    connection,
    clock,
    sessionService,
    contactCrypto,
    registrationPolicyService
  });
  const otpService = createOtpService({
    connection,
    clock,
    contactDelivery: ports.contactDelivery,
    sessionService,
    contactCrypto,
    verificationHandlers: { REGISTER: registerHandler },
    otpSecret: config.auth.otpSecret,
    logger
  });

  return authModule({
    otpService,
    sessionService,
    accountSettingsService,
    requireAuthenticated: requireSession(sessionService, { clock }),
    requireCsrf: requireCsrf(sessionService),
    secureCookies: config.secureCookies
  });
}
