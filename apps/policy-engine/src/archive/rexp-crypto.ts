/** Encrypts Relution payloads and strictly decodes archive JSON. */
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { TextDecoder } from "node:util";

const SALT_LENGTH = 8;
const IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 16;
const PBKDF2_ITERATIONS = 10000;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function encryptedRelutionPayloadLength(plaintextLength: number): number {
  return 1 + SALT_LENGTH + 1 + IV_LENGTH + plaintextLength + GCM_TAG_LENGTH;
}

export function decryptRelutionPayload(payload: Buffer, password: string): Buffer {
  const saltLength = readLength(payload, 0, 1, 9, "salt");
  const saltEnd = 1 + saltLength;
  const ivLength = readLength(payload, saltEnd, 12, 16, "IV");
  const ivEnd = saltEnd + 1 + ivLength;
  if (payload.length < ivEnd + GCM_TAG_LENGTH) throw new Error("Encrypted payload is too short");
  const key = deriveKey(password, payload.subarray(1, saltEnd));
  const encrypted = payload.subarray(ivEnd);
  const decipher = createDecipheriv("aes-128-gcm", key, payload.subarray(saltEnd + 1, ivEnd), { authTagLength: GCM_TAG_LENGTH });
  decipher.setAuthTag(encrypted.subarray(encrypted.length - GCM_TAG_LENGTH));
  return Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - GCM_TAG_LENGTH)), decipher.final()]);
}

export function encryptRelutionPayload(plaintext: Buffer, password: string, randomSource: (size: number) => Buffer = randomBytes): Buffer {
  const salt = randomSource(SALT_LENGTH);
  const iv = randomSource(IV_LENGTH);
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) throw new Error("Random source returned an unexpected length");
  const cipher = createCipheriv("aes-128-gcm", deriveKey(password, salt), iv, { authTagLength: GCM_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([salt.length]), salt, Buffer.from([iv.length]), iv, ciphertext, cipher.getAuthTag()]);
}

export function parseJson(buffer: Buffer, label: string): unknown {
  try {
    return JSON.parse(UTF8_DECODER.decode(buffer)) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid UTF-8 JSON in ${label}: ${message}`);
  }
}

export function formatJsonBuffer(buffer: Buffer, label: string): Buffer {
  return Buffer.from(`${JSON.stringify(parseJson(buffer, label), null, 2)}\n`, "utf8");
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BYTES, "sha256");
}

function readLength(payload: Buffer, offset: number, minInclusive: number, maxExclusive: number, label: string): number {
  const length = payload[offset];
  if (length === undefined) throw new Error(`Missing ${label} length`);
  if (length < minInclusive || length >= maxExclusive) throw new Error(`Unexpected ${label} length ${length}`);
  return length;
}
