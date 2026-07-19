ALTER TABLE "collage_members"
  ADD COLUMN "manualPaymentEmailEncrypted" TEXT,
  ADD COLUMN "manualPaymentEmailHash" CHAR(64);

CREATE INDEX "collage_members_manual_payment_email_hash_idx"
  ON "collage_members" ("manualPaymentEmailHash")
  WHERE "manualPaymentEmailHash" IS NOT NULL;
