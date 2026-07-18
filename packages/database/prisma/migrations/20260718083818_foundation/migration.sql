-- CreateEnum
CREATE TYPE "CollageState" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'STARTING', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberState" AS ENUM ('NOT_STARTED', 'DETAILS_SUBMITTED', 'IDENTITY_PENDING', 'IDENTITY_FAILED', 'PAYMENT_METHOD_REQUIRED', 'PAYMENT_METHOD_AUTHORIZING', 'REGISTERED', 'AT_RISK', 'DELINQUENT', 'DEFAULTED', 'CANCELLED_BEFORE_START');

-- CreateEnum
CREATE TYPE "PaymentMethodState" AS ENUM ('AUTHORIZING', 'ACTIVE', 'FAILED', 'EXPIRED', 'SUSPENDED', 'CANCELLED', 'REPLACED');

-- CreateEnum
CREATE TYPE "CycleState" AS ENUM ('SCHEDULED', 'COLLECTING', 'OVERDUE', 'BLOCKED_BY_DEFAULT', 'READY_FOR_PAYOUT', 'PAYOUT_PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContributionState" AS ENUM ('SCHEDULED', 'CHARGE_PENDING', 'PAID', 'FAILED_RETRYABLE', 'MANUAL_PAYMENT_REQUIRED', 'OVERDUE', 'DEFAULTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutState" AS ENUM ('READY', 'PROCESSING', 'PENDING_AUTHORIZATION', 'IN_PROGRESS', 'SUCCESSFUL', 'FAILED', 'REVERSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderOperationState" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'REVERSED', 'EXPIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PayoutTiming" AS ENUM ('IMMEDIATE_WHEN_READY', 'SCHEDULED_WHEN_READY');

-- CreateEnum
CREATE TYPE "CardSetupPolicy" AS ENUM ('COMMITMENT_DEPOSIT', 'FIRST_CONTRIBUTION', 'SANDBOX_SIMULATION');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD_TOKEN', 'DIRECT_DEBIT');

-- CreateEnum
CREATE TYPE "PaymentAttemptType" AS ENUM ('CARD_SETUP', 'CARD_TOKEN_CHARGE', 'DIRECT_DEBIT', 'MANUAL_CHECKOUT');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EXPENSE', 'RECEIVABLE', 'CLEARING');

-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatMembershipState" AS ENUM ('ACTIVE', 'LEFT', 'BANNED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TelegramChatType" AS ENUM ('GROUP', 'SUPERGROUP', 'CHANNEL');

-- CreateEnum
CREATE TYPE "TelegramRole" AS ENUM ('MEMBER', 'ADMINISTRATOR', 'CREATOR', 'RESTRICTED', 'LEFT', 'KICKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BankAccountState" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'INVALID', 'REPLACED');

-- CreateEnum
CREATE TYPE "NotificationState" AS ENUM ('PENDING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_TERMINAL');

-- CreateEnum
CREATE TYPE "LaunchTokenState" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "telegramUserId" VARCHAR(32) NOT NULL,
    "username" VARCHAR(64),
    "firstName" VARCHAR(128),
    "lastName" VARCHAR(128),
    "languageCode" VARCHAR(16),
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_chats" (
    "id" UUID NOT NULL,
    "telegramChatId" VARCHAR(32) NOT NULL,
    "type" "TelegramChatType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "username" VARCHAR(64),
    "botCanPinMessages" BOOLEAN NOT NULL DEFAULT false,
    "pinnedStatusMessageId" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_chat_memberships" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TelegramRole" NOT NULL DEFAULT 'UNKNOWN',
    "state" "ChatMembershipState" NOT NULL DEFAULT 'UNKNOWN',
    "joinedAt" TIMESTAMPTZ(6),
    "leftAt" TIMESTAMPTZ(6),
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_chat_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collages" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "creatorUserId" UUID NOT NULL,
    "state" "CollageState" NOT NULL DEFAULT 'DRAFT',
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "contributionAmountMinor" BIGINT NOT NULL,
    "participantLimit" INTEGER NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "frequencyInterval" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(64) NOT NULL,
    "firstCycleStartAt" TIMESTAMPTZ(6) NOT NULL,
    "cycleDeadlineOffsetMinutes" INTEGER NOT NULL,
    "gracePeriodMinutes" INTEGER NOT NULL,
    "reminderRule" JSONB,
    "payoutTiming" "PayoutTiming" NOT NULL,
    "cardSetupPolicy" "CardSetupPolicy" NOT NULL,
    "cardSetupAmountMinor" BIGINT NOT NULL,
    "currentRuleVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "rulesLockedAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collage_rule_versions" (
    "id" UUID NOT NULL,
    "collageId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "deterministicHash" CHAR(64) NOT NULL,
    "rules" JSONB NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(6),

    CONSTRAINT "collage_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collage_members" (
    "id" UUID NOT NULL,
    "collageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "telegramUserId" VARCHAR(32) NOT NULL,
    "state" "MemberState" NOT NULL DEFAULT 'NOT_STARTED',
    "payoutPosition" INTEGER,
    "acceptedRuleVersionId" UUID,
    "legalNameEncrypted" TEXT,
    "ninEncrypted" TEXT,
    "ninHash" CHAR(64),
    "phoneEncrypted" TEXT,
    "phoneHash" CHAR(64),
    "phoneVerifiedAt" TIMESTAMPTZ(6),
    "identityVerifiedAt" TIMESTAMPTZ(6),
    "identityVerificationMode" VARCHAR(32),
    "preferredChargeRule" JSONB,
    "recurringConsentAt" TIMESTAMPTZ(6),
    "registeredAt" TIMESTAMPTZ(6),
    "telegramLeftAt" TIMESTAMPTZ(6),
    "outstandingObligationMinor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collage_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_position_reservations" (
    "id" UUID NOT NULL,
    "collageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "state" "ReservationState" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payout_position_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "targetHash" CHAR(64) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "bankCode" VARCHAR(16) NOT NULL,
    "bankName" VARCHAR(128) NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountNumberHash" CHAR(64) NOT NULL,
    "accountNameEncrypted" TEXT NOT NULL,
    "maskedAccountNumber" VARCHAR(32) NOT NULL,
    "state" "BankAccountState" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(6),
    "replacedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "state" "PaymentMethodState" NOT NULL DEFAULT 'AUTHORIZING',
    "provider" VARCHAR(32) NOT NULL DEFAULT 'MONNIFY',
    "providerCustomerReference" VARCHAR(128),
    "credentialEncrypted" TEXT,
    "credentialHash" CHAR(64),
    "maskedLabel" VARCHAR(64),
    "activeAt" TIMESTAMPTZ(6),
    "replacedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_authorizations" (
    "id" UUID NOT NULL,
    "paymentMethodId" UUID NOT NULL,
    "setupAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "providerReference" VARCHAR(191),
    "state" "ProviderOperationState" NOT NULL DEFAULT 'CREATED',
    "reusableTokenReady" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_debit_mandates" (
    "id" UUID NOT NULL,
    "paymentMethodId" UUID NOT NULL,
    "mandateReference" VARCHAR(191) NOT NULL,
    "providerMandateId" VARCHAR(191),
    "authorizationUrlEncrypted" TEXT,
    "mandateDataEncrypted" TEXT,
    "state" "ProviderOperationState" NOT NULL DEFAULT 'CREATED',
    "activatedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "direct_debit_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" UUID NOT NULL,
    "collageId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "recipientMemberId" UUID NOT NULL,
    "state" "CycleState" NOT NULL DEFAULT 'SCHEDULED',
    "expectedAmountMinor" BIGINT NOT NULL,
    "confirmedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMPTZ(6) NOT NULL,
    "deadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "graceEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "payoutScheduledAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_contributions" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "state" "ContributionState" NOT NULL DEFAULT 'SCHEDULED',
    "chargeAt" TIMESTAMPTZ(6) NOT NULL,
    "paidAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cycle_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "contributionId" UUID NOT NULL,
    "type" "PaymentAttemptType" NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'MONNIFY',
    "providerEnvironment" VARCHAR(16) NOT NULL,
    "providerReference" VARCHAR(191) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "state" "ProviderOperationState" NOT NULL DEFAULT 'CREATED',
    "providerPayloadEncrypted" TEXT,
    "initiatedAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "state" "PayoutState" NOT NULL DEFAULT 'READY',
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_attempts" (
    "id" UUID NOT NULL,
    "payoutId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'MONNIFY',
    "providerEnvironment" VARCHAR(16) NOT NULL,
    "providerReference" VARCHAR(191) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "state" "ProviderOperationState" NOT NULL DEFAULT 'CREATED',
    "providerPayloadEncrypted" TEXT,
    "initiatedAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "collageId" UUID,
    "key" VARCHAR(191) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "correlationId" VARCHAR(191) NOT NULL,
    "referenceType" VARCHAR(64) NOT NULL,
    "referenceId" VARCHAR(191) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "reversalOfId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerEnvironment" VARCHAR(16) NOT NULL,
    "providerEventId" VARCHAR(191),
    "fingerprint" CHAR(64) NOT NULL,
    "eventType" VARCHAR(128),
    "signatureValid" BOOLEAN NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "processingErrorCode" VARCHAR(128),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(128) NOT NULL,
    "aggregateType" VARCHAR(64) NOT NULL,
    "aggregateId" VARCHAR(191) NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" VARCHAR(191) NOT NULL,
    "causationId" VARCHAR(191),
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(128),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "eventId" UUID NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "destinationHash" CHAR(64) NOT NULL,
    "template" VARCHAR(128) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "state" "NotificationState" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" VARCHAR(191),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorType" VARCHAR(32) NOT NULL,
    "actorId" VARCHAR(191),
    "action" VARCHAR(128) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(191) NOT NULL,
    "correlationId" VARCHAR(191) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "safeMetadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID,
    "collageId" UUID,
    "chatId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "state" "LaunchTokenState" NOT NULL DEFAULT 'ACTIVE',
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "launch_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_identities_telegramUserId_key" ON "telegram_identities"("telegramUserId");

-- CreateIndex
CREATE INDEX "telegram_identities_userId_idx" ON "telegram_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chats_telegramChatId_key" ON "telegram_chats"("telegramChatId");

-- CreateIndex
CREATE INDEX "telegram_chat_memberships_userId_state_idx" ON "telegram_chat_memberships"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chat_memberships_chatId_userId_key" ON "telegram_chat_memberships"("chatId", "userId");

-- CreateIndex
CREATE INDEX "collages_chatId_state_idx" ON "collages"("chatId", "state");

-- CreateIndex
CREATE INDEX "collages_creatorUserId_idx" ON "collages"("creatorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "collage_rule_versions_collageId_version_key" ON "collage_rule_versions"("collageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "collage_rule_versions_collageId_deterministicHash_key" ON "collage_rule_versions"("collageId", "deterministicHash");

-- CreateIndex
CREATE INDEX "collage_members_collageId_state_idx" ON "collage_members"("collageId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "collage_members_collageId_userId_key" ON "collage_members"("collageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "collage_members_collageId_telegramUserId_key" ON "collage_members"("collageId", "telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "collage_members_collageId_payoutPosition_key" ON "collage_members"("collageId", "payoutPosition");

-- CreateIndex
CREATE INDEX "payout_position_reservations_collageId_position_state_idx" ON "payout_position_reservations"("collageId", "position", "state");

-- CreateIndex
CREATE INDEX "payout_position_reservations_expiresAt_state_idx" ON "payout_position_reservations"("expiresAt", "state");

-- CreateIndex
CREATE INDEX "otp_challenges_userId_purpose_expiresAt_idx" ON "otp_challenges"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "bank_accounts_memberId_state_idx" ON "bank_accounts"("memberId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_memberId_accountNumberHash_key" ON "bank_accounts"("memberId", "accountNumberHash");

-- CreateIndex
CREATE INDEX "payment_methods_memberId_state_idx" ON "payment_methods"("memberId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "card_authorizations_idempotencyKey_key" ON "card_authorizations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "card_authorizations_paymentMethodId_state_idx" ON "card_authorizations"("paymentMethodId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "card_authorizations_providerReference_key" ON "card_authorizations"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_mandates_mandateReference_key" ON "direct_debit_mandates"("mandateReference");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_mandates_providerMandateId_key" ON "direct_debit_mandates"("providerMandateId");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_paymentMethodId_state_idx" ON "direct_debit_mandates"("paymentMethodId", "state");

-- CreateIndex
CREATE INDEX "cycles_collageId_state_idx" ON "cycles"("collageId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "cycles_collageId_number_key" ON "cycles"("collageId", "number");

-- CreateIndex
CREATE INDEX "cycle_contributions_cycleId_state_idx" ON "cycle_contributions"("cycleId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_contributions_cycleId_memberId_key" ON "cycle_contributions"("cycleId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotencyKey_key" ON "payment_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_attempts_contributionId_state_idx" ON "payment_attempts"("contributionId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_providerEnvironment_providerRefer_key" ON "payment_attempts"("provider", "providerEnvironment", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_cycleId_key" ON "payouts"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotencyKey_key" ON "payouts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payouts_memberId_state_idx" ON "payouts"("memberId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "payout_attempts_idempotencyKey_key" ON "payout_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payout_attempts_payoutId_state_idx" ON "payout_attempts"("payoutId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "payout_attempts_provider_providerEnvironment_providerRefere_key" ON "payout_attempts"("provider", "providerEnvironment", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_key_key" ON "ledger_accounts"("key");

-- CreateIndex
CREATE INDEX "ledger_accounts_collageId_code_idx" ON "ledger_accounts"("collageId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reversalOfId_key" ON "ledger_transactions"("reversalOfId");

-- CreateIndex
CREATE INDEX "ledger_transactions_referenceType_referenceId_idx" ON "ledger_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ledger_transactions_correlationId_idx" ON "ledger_transactions"("correlationId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_createdAt_idx" ON "ledger_entries"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "webhook_events_processedAt_receivedAt_idx" ON "webhook_events"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEnvironment_fingerprint_key" ON "webhook_events"("provider", "providerEnvironment", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEnvironment_providerEventId_key" ON "webhook_events"("provider", "providerEnvironment", "providerEventId");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_occurredAt_idx" ON "outbox_events"("publishedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_aggregateVersion_idx" ON "outbox_events"("aggregateType", "aggregateId", "aggregateVersion");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_idempotencyKey_key" ON "notification_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_eventId_state_idx" ON "notification_deliveries"("eventId", "state");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_occurredAt_idx" ON "audit_logs"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "launch_tokens_tokenHash_key" ON "launch_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "launch_tokens_expiresAt_state_idx" ON "launch_tokens"("expiresAt", "state");

-- AddForeignKey
ALTER TABLE "telegram_identities" ADD CONSTRAINT "telegram_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_chat_memberships" ADD CONSTRAINT "telegram_chat_memberships_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "telegram_chats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_chat_memberships" ADD CONSTRAINT "telegram_chat_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collages" ADD CONSTRAINT "collages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "telegram_chats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collages" ADD CONSTRAINT "collages_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collage_rule_versions" ADD CONSTRAINT "collage_rule_versions_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collage_members" ADD CONSTRAINT "collage_members_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collage_members" ADD CONSTRAINT "collage_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collage_members" ADD CONSTRAINT "collage_members_acceptedRuleVersionId_fkey" FOREIGN KEY ("acceptedRuleVersionId") REFERENCES "collage_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_position_reservations" ADD CONSTRAINT "payout_position_reservations_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_position_reservations" ADD CONSTRAINT "payout_position_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "collage_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "collage_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_authorizations" ADD CONSTRAINT "card_authorizations_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_recipientMemberId_fkey" FOREIGN KEY ("recipientMemberId") REFERENCES "collage_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_contributions" ADD CONSTRAINT "cycle_contributions_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_contributions" ADD CONSTRAINT "cycle_contributions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "collage_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "cycle_contributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "collage_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_tokens" ADD CONSTRAINT "launch_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_tokens" ADD CONSTRAINT "launch_tokens_collageId_fkey" FOREIGN KEY ("collageId") REFERENCES "collages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_tokens" ADD CONSTRAINT "launch_tokens_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "telegram_chats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-enforced financial and lifecycle invariants not expressible in Prisma.
CREATE UNIQUE INDEX "collages_one_current_per_chat"
ON "collages" ("chatId")
WHERE "state" IN ('REGISTRATION_OPEN', 'STARTING', 'ACTIVE', 'BLOCKED', 'SUSPENDED');

CREATE UNIQUE INDEX "position_reservations_one_live_position"
ON "payout_position_reservations" ("collageId", "position")
WHERE "state" = 'RESERVED';

CREATE UNIQUE INDEX "position_reservations_one_live_user"
ON "payout_position_reservations" ("collageId", "userId")
WHERE "state" = 'RESERVED';

CREATE UNIQUE INDEX "payment_methods_one_active_per_member"
ON "payment_methods" ("memberId")
WHERE "state" = 'ACTIVE';

CREATE UNIQUE INDEX "bank_accounts_one_verified_default"
ON "bank_accounts" ("memberId")
WHERE "isDefault" = true AND "state" = 'VERIFIED';

CREATE UNIQUE INDEX "payment_attempts_one_unresolved"
ON "payment_attempts" ("contributionId")
WHERE "state" IN ('CREATED', 'PENDING', 'UNKNOWN');

CREATE UNIQUE INDEX "payout_attempts_one_unresolved"
ON "payout_attempts" ("payoutId")
WHERE "state" IN ('CREATED', 'PENDING', 'UNKNOWN');

CREATE UNIQUE INDEX "outbox_events_once_per_aggregate_version"
ON "outbox_events" ("aggregateType", "aggregateId", "aggregateVersion", "eventType");

ALTER TABLE "collages"
  ADD CONSTRAINT "collages_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "collages_positive_contribution" CHECK ("contributionAmountMinor" > 0),
  ADD CONSTRAINT "collages_participant_limit" CHECK ("participantLimit" BETWEEN 2 AND 100),
  ADD CONSTRAINT "collages_frequency_interval" CHECK ("frequencyInterval" > 0),
  ADD CONSTRAINT "collages_deadline_offset" CHECK ("cycleDeadlineOffsetMinutes" > 0),
  ADD CONSTRAINT "collages_grace_period" CHECK ("gracePeriodMinutes" >= 0),
  ADD CONSTRAINT "collages_card_setup_amount" CHECK ("cardSetupAmountMinor" >= 0),
  ADD CONSTRAINT "collages_started_fields" CHECK (
    ("state" NOT IN ('STARTING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'COMPLETED'))
    OR ("startedAt" IS NOT NULL AND "rulesLockedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "collages_completed_fields" CHECK (
    "state" <> 'COMPLETED' OR "completedAt" IS NOT NULL
  );

ALTER TABLE "collage_rule_versions"
  ADD CONSTRAINT "collage_rule_versions_positive_version" CHECK ("version" > 0);

ALTER TABLE "collage_members"
  ADD CONSTRAINT "collage_members_positive_position" CHECK ("payoutPosition" IS NULL OR "payoutPosition" > 0),
  ADD CONSTRAINT "collage_members_nonnegative_obligation" CHECK ("outstandingObligationMinor" >= 0),
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
      AND "identityVerifiedAt" IS NOT NULL
      AND "recurringConsentAt" IS NOT NULL
      AND "registeredAt" IS NOT NULL
    )
  );

ALTER TABLE "payout_position_reservations"
  ADD CONSTRAINT "position_reservations_positive_position" CHECK ("position" > 0),
  ADD CONSTRAINT "position_reservations_future_expiry" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_attempt_bounds" CHECK (
    "attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts"
  ),
  ADD CONSTRAINT "otp_challenges_future_expiry" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "bank_accounts"
  ADD CONSTRAINT "bank_accounts_verified_fields" CHECK (
    "state" <> 'VERIFIED' OR "verifiedAt" IS NOT NULL
  ),
  ADD CONSTRAINT "bank_accounts_default_verified" CHECK (
    NOT "isDefault" OR "state" = 'VERIFIED'
  );

ALTER TABLE "payment_methods"
  ADD CONSTRAINT "payment_methods_active_fields" CHECK (
    "state" <> 'ACTIVE'
    OR (
      "activeAt" IS NOT NULL
      AND "credentialEncrypted" IS NOT NULL
      AND "credentialHash" IS NOT NULL
      AND "maskedLabel" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "payment_methods_replaced_fields" CHECK (
    "state" <> 'REPLACED' OR "replacedAt" IS NOT NULL
  );

ALTER TABLE "card_authorizations"
  ADD CONSTRAINT "card_authorizations_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "card_authorizations_positive_amount" CHECK ("setupAmountMinor" > 0);

ALTER TABLE "cycles"
  ADD CONSTRAINT "cycles_positive_number" CHECK ("number" > 0),
  ADD CONSTRAINT "cycles_positive_expected" CHECK ("expectedAmountMinor" > 0),
  ADD CONSTRAINT "cycles_confirmed_bounds" CHECK (
    "confirmedAmountMinor" >= 0 AND "confirmedAmountMinor" <= "expectedAmountMinor"
  ),
  ADD CONSTRAINT "cycles_time_order" CHECK (
    "opensAt" < "deadlineAt" AND "deadlineAt" <= "graceEndsAt"
  ),
  ADD CONSTRAINT "cycles_completed_fields" CHECK (
    "state" <> 'COMPLETED' OR "completedAt" IS NOT NULL
  );

ALTER TABLE "cycle_contributions"
  ADD CONSTRAINT "cycle_contributions_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "cycle_contributions_positive_amount" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "cycle_contributions_paid_fields" CHECK (
    "state" <> 'PAID' OR "paidAt" IS NOT NULL
  );

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "payment_attempts_positive_amount" CHECK ("amountMinor" > 0);

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "payouts_positive_amount" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "payouts_success_fields" CHECK (
    "state" <> 'SUCCESSFUL' OR "completedAt" IS NOT NULL
  );

ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_currency_ngn" CHECK ("currency" = 'NGN');

ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_currency_ngn" CHECK ("currency" = 'NGN'),
  ADD CONSTRAINT "ledger_transactions_not_self_reversal" CHECK ("reversalOfId" IS NULL OR "reversalOfId" <> "id");

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_positive_amount" CHECK ("amountMinor" > 0);

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_positive_versions" CHECK (
    "aggregateVersion" >= 0 AND "schemaVersion" > 0 AND "publishAttempts" >= 0
  );

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_attempts" CHECK (
    "templateVersion" > 0 AND "attemptCount" >= 0
  );

ALTER TABLE "launch_tokens"
  ADD CONSTRAINT "launch_tokens_future_expiry" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "launch_tokens_has_binding" CHECK (
    "userId" IS NOT NULL OR "collageId" IS NOT NULL OR "chatId" IS NOT NULL
  ),
  ADD CONSTRAINT "launch_tokens_consumed_fields" CHECK (
    "state" <> 'CONSUMED' OR "consumedAt" IS NOT NULL
  );

CREATE FUNCTION prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "ledger_transactions_append_only"
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE FUNCTION assert_balanced_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id uuid;
  entry_count bigint;
  debit_total numeric;
  credit_total numeric;
BEGIN
  target_transaction_id := CASE
    WHEN TG_TABLE_NAME = 'ledger_entries' THEN NEW."transactionId"
    ELSE NEW."id"
  END;

  SELECT
    count(*),
    COALESCE(sum(CASE WHEN "side" = 'DEBIT' THEN "amountMinor" ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN "side" = 'CREDIT' THEN "amountMinor" ELSE 0 END), 0)
  INTO entry_count, debit_total, credit_total
  FROM "ledger_entries"
  WHERE "transactionId" = target_transaction_id;

  IF entry_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced', target_transaction_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "ledger_transaction_balance_on_transaction"
AFTER INSERT ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger_transaction();

CREATE CONSTRAINT TRIGGER "ledger_transaction_balance_on_entry"
AFTER INSERT ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger_transaction();
