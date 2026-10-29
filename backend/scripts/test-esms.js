// Operator-only smoke test. Never imported by the HTTP runtime.
import { randomInt, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { loadEsmsConfig } from '../src/config/esms.js';
import { createSmsDelivery } from '../src/services/sms-delivery.service.js';
import { normalizeVietnamPhone } from '../src/services/sms-template.service.js';

const args = process.argv.slice(2);
const live = args.includes('--live');
const sandbox = args.includes('--sandbox');
if ((!live && !sandbox) || (live && sandbox)) {
  console.log('Choose --sandbox or --live and supply --phone <your-authorized-test-number>. Live sends one SMS; there is no automatic retry.');
  process.exitCode = 1;
} else {
  try {
    const index = args.indexOf('--phone');
    const phone = normalizeVietnamPhone(index >= 0 ? args[index + 1] : process.env.ESMS_TEST_PHONE);
    if (!phone) throw new Error('INVALID_TEST_PHONE');
    const config = loadEsmsConfig({ ...process.env, SMS_ENABLED: 'true', ESMS_SANDBOX: sandbox ? 'true' : 'false' });
    const operationId = randomUUID();
    let providerCode = null;
    let providerId = null;
    const fetchImpl = async (...request) => {
      const response = await globalThis.fetch(...request);
      try {
        const payload = await response.clone().json();
        if (/^\d{2,3}$/.test(String(payload.CodeResult))) providerCode = String(payload.CodeResult);
        if (/^[a-zA-Z0-9_-]{1,128}$/.test(payload.SMSID ?? '')) providerId = payload.SMSID;
      } catch { /* Delivery adapter handles invalid provider bodies. */ }
      return response;
    };
    const result = await createSmsDelivery({ ...config, fetchImpl }).send({
      channel: 'SMS', kind: 'OTP', to: phone, operationId, purpose: 'LOGIN',
      code: String(randomInt(0, 1000000)).padStart(6, '0'),
      expiresAt: new Date(Date.now() + 300000).toISOString()
    });
    const receipt = { checkedAt: new Date().toISOString(), sandbox, operationId, providerCode, providerId, result };
    if (process.env.ESMS_TEST_RECEIPT) {
      try {
        await writeFile(process.env.ESMS_TEST_RECEIPT, JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' });
      } catch {
        // A receipt failure must not disguise an accepted send as safe to retry.
        console.log(JSON.stringify({ status: 'RECEIPT_WRITE_FAILED', sendMayHaveOccurred: true }));
        process.exitCode = 1;
      }
    }
    console.log(JSON.stringify({ sandbox, providerCode, ...result }));
    if (result.status !== 'ACCEPTED' && result.code !== 'SANDBOX_VALIDATED') process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ status: 'TEST_UNAVAILABLE',
      code: error.code === 'SMS_CONFIGURATION_INVALID' ? error.code : 'CHECK_CONFIGURATION_OR_TEST_INPUT',
      ...(Array.isArray(error.details?.fields) ? { fields: error.details.fields } : {}) }));
    process.exitCode = 1;
  }
}
