import { randomUUID } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { config } from '../config/env.js';
import { TimeoutOtpProvider } from './timeout-provider.js';

const ESMS_SEND_URL = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

function nationalVietnamPhone(destination) {
  const phone = parsePhoneNumberFromString(destination, 'VN');
  if (!phone?.isValid() || phone.country !== 'VN') throw new Error('Invalid Vietnam phone destination');
  return phone.formatNational().replace(/\D/g, '');
}

export class EsmsOtpProvider extends TimeoutOtpProvider {
  constructor() {
    super(async ({ destination, otp, signal }) => {
      const response = await fetch(ESMS_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ApiKey: config.esmsApiKey,
          SecretKey: config.esmsSecretKey,
          Phone: nationalVietnamPhone(destination),
          Content: config.esmsContentTemplate.replaceAll('{OTP}', otp),
          Brandname: config.esmsBrandname,
          SmsType: '2',
          IsUnicode: config.esmsIsUnicode,
          Sandbox: config.esmsSandbox ? '1' : '0',
          RequestId: randomUUID(),
        }),
        signal,
      });

      if (!response.ok) throw new Error('eSMS request failed');
      const result = await response.json();
      if (String(result?.CodeResult) !== '100') throw new Error('eSMS rejected the SMS request');
    });
  }
}
