ALTER TABLE "payment_methods"
ADD COLUMN "customerEmailEncrypted" TEXT;

COMMENT ON COLUMN "payment_methods"."customerEmailEncrypted" IS
  'AES-256-GCM encrypted provider customer email; required for non-interactive recurring card transaction initialization.';
