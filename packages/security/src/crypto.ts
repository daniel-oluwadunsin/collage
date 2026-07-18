import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface EncryptionKeyring {
  readonly activeKeyId: string;
  readonly keys: Readonly<Record<string, Buffer>>;
}

interface EncryptedEnvelope {
  readonly algorithm: "A256GCM";
  readonly ciphertext: string;
  readonly iv: string;
  readonly keyId: string;
  readonly tag: string;
  readonly version: 1;
}

const getKey = (keyring: EncryptionKeyring, keyId: string): Buffer => {
  const key = keyring.keys[keyId];
  if (key?.byteLength !== 32) {
    throw new Error(`Missing valid 32-byte encryption key: ${keyId}`);
  }
  return key;
};

export const encryptString = (
  plaintext: string,
  keyring: EncryptionKeyring,
  context: string,
): string => {
  const key = getKey(keyring, keyring.activeKeyId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const envelope: EncryptedEnvelope = {
    version: 1,
    algorithm: "A256GCM",
    keyId: keyring.activeKeyId,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return `collage:v1:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
};

export const decryptString = (
  encoded: string,
  keyring: EncryptionKeyring,
  context: string,
): string => {
  const prefix = "collage:v1:";
  if (!encoded.startsWith(prefix)) {
    throw new Error("Unsupported ciphertext envelope");
  }
  const parsed: unknown = JSON.parse(
    Buffer.from(encoded.slice(prefix.length), "base64url").toString("utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("algorithm" in parsed) ||
    parsed.algorithm !== "A256GCM" ||
    !("keyId" in parsed) ||
    typeof parsed.keyId !== "string" ||
    !("iv" in parsed) ||
    typeof parsed.iv !== "string" ||
    !("tag" in parsed) ||
    typeof parsed.tag !== "string" ||
    !("ciphertext" in parsed) ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("Invalid ciphertext envelope");
  }
  const key = getKey(keyring, parsed.keyId);
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(parsed.iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

export const keyedHash = (value: string, key: Buffer): string => {
  if (key.byteLength < 32) {
    throw new Error("Keyed-hash key must be at least 32 bytes");
  }
  return createHmac("sha256", key)
    .update(value.normalize("NFKC").trim(), "utf8")
    .digest("hex");
};

export const constantTimeEqual = (left: string, right: string): boolean => {
  const leftDigest = createHmac("sha256", Buffer.alloc(32))
    .update(left)
    .digest();
  const rightDigest = createHmac("sha256", Buffer.alloc(32))
    .update(right)
    .digest();
  return timingSafeEqual(leftDigest, rightDigest);
};
