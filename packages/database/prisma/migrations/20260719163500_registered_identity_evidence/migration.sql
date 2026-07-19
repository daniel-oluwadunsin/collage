ALTER TABLE "collage_members"
  DROP CONSTRAINT "collage_members_registered_fields";

UPDATE "collage_members"
SET
  "identityVerificationMode" = 'COLLECTED_UNVERIFIED',
  "identityVerifiedAt" = NULL
WHERE
  "legalNameEncrypted" IS NOT NULL
  AND "ninEncrypted" IS NOT NULL
  AND "ninHash" IS NOT NULL
  AND "identityVerificationMode" IS NULL;

ALTER TABLE "collage_members"
  ADD CONSTRAINT "collage_members_registered_fields" CHECK (
    "state" <> 'REGISTERED'
    OR (
      "payoutPosition" IS NOT NULL
      AND "acceptedRuleVersionId" IS NOT NULL
      AND "legalNameEncrypted" IS NOT NULL
      AND "ninEncrypted" IS NOT NULL
      AND "ninHash" IS NOT NULL
      AND "phoneEncrypted" IS NOT NULL
      AND "phoneHash" IS NOT NULL
      AND "phoneVerifiedAt" IS NOT NULL
      AND "identityVerificationMode" IS NOT NULL
      AND (
        (
          "identityVerificationMode" = 'COLLECTED_UNVERIFIED'
          AND "identityVerifiedAt" IS NULL
        )
        OR (
          "identityVerificationMode" <> 'COLLECTED_UNVERIFIED'
          AND "identityVerifiedAt" IS NOT NULL
        )
      )
      AND "preferredChargeRule" IS NOT NULL
      AND "recurringConsentAt" IS NOT NULL
      AND "registeredAt" IS NOT NULL
    )
  );
