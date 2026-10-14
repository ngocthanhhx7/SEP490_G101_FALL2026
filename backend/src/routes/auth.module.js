import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createOtpService } from '../services/otp-verification.service.js';
import { createSessionService } from '../services/session.service.js';
import { createAccountSettingsService } from '../services/account-settings.service.js';
import { requireCsrf, requireSession } from '../middlewares/session.js';
import { authModule } from './auth.routes.js';

export function authenticationModule({ config, connection, ports, logger = () => {} }) {
  if (!config.auth?.enabled) return null;

  const sessionService = createSessionService({
    connection,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const contactCrypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const accountSettingsService = createAccountSettingsService({ connection, contactCrypto });
  const otpService = createOtpService({
    connection,
    contactDelivery: ports.contactDelivery,
    sessionService,
    contactCrypto,
    otpSecret: config.auth.otpSecret,
    logger
  });

  return authModule({
    otpService,
    sessionService,
    accountSettingsService,
    requireAuthenticated: requireSession(sessionService),
    requireCsrf: requireCsrf(sessionService),
    secureCookies: config.secureCookies
  });
}
