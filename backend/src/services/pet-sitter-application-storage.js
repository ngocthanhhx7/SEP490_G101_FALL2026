import { createCipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const storageRoot = fileURLToPath(new URL('../../storage/pet-sitter-applications/', import.meta.url));

function encryptionKey() {
  if (config.petSitterPiiEncryptionKey) return Buffer.from(config.petSitterPiiEncryptionKey, 'hex');
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(config.otpHmacSecret, 'utf8'),
    Buffer.from('paw-world-care', 'utf8'),
    Buffer.from('pet-sitter-pii-aes-256-gcm-v1', 'utf8'),
    32,
  ));
}

export function encryptSensitiveValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    algorithm: 'AES-256-GCM',
    keyVersion: 1,
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPdf(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function verifyUpload(field, file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0) {
    throw new AppError('VALIDATION_ERROR', 400, { field });
  }
  const image = isPng(file.buffer) || isJpeg(file.buffer);
  const valid = field === 'certificate'
    ? image || isPdf(file.buffer)
    : image;
  if (!valid) throw new AppError('VALIDATION_ERROR', 400, { field, reason: 'UNSUPPORTED_FILE_TYPE' });
  return isPng(file.buffer) ? 'image/png' : isJpeg(file.buffer) ? 'image/jpeg' : 'application/pdf';
}

async function writeEncryptedFile(directory, file) {
  const iv = randomBytes(12);
  const finalCipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([finalCipher.update(file.buffer), finalCipher.final()]);
  const bytes = Buffer.concat([iv, finalCipher.getAuthTag(), ciphertext]);
  const filename = `${randomUUID()}.enc`;
  await writeFile(path.join(directory, filename), bytes, { flag: 'wx', mode: 0o600 });
  return filename;
}

export async function persistApplicationFiles(applicationId, files) {
  const portrait = files.portrait?.[0];
  const nationalIdFront = files.nationalIdFront?.[0];
  const nationalIdBack = files.nationalIdBack?.[0];
  const certificates = files.certificates ?? [];
  const portraitType = verifyUpload('portrait', portrait);
  const idFrontType = verifyUpload('nationalIdFront', nationalIdFront);
  const idBackType = verifyUpload('nationalIdBack', nationalIdBack);
  certificates.forEach((file) => verifyUpload('certificate', file));

  const directory = path.join(storageRoot, String(applicationId));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const [portraitKey, nationalIdFrontKey, nationalIdBackKey] = await Promise.all([
      writeEncryptedFile(directory, portrait),
      writeEncryptedFile(directory, nationalIdFront),
      writeEncryptedFile(directory, nationalIdBack),
    ]);
    const certificateKeys = await Promise.all(certificates.map((file) => writeEncryptedFile(directory, file)));
    return {
      documents: {
        portrait: portraitKey,
        nationalIdFront: nationalIdFrontKey,
        nationalIdBack: nationalIdBackKey,
        certificates: certificateKeys,
      },
      mediaTypes: { portrait: portraitType, nationalIdFront: idFrontType, nationalIdBack: idBackType },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function removeApplicationFiles(applicationId) {
  await rm(path.join(storageRoot, String(applicationId)), { recursive: true, force: true });
}
