ALTER TABLE "launch_tokens" ADD COLUMN "resourceId" UUID;
CREATE INDEX "launch_tokens_resourceId_action_idx" ON "launch_tokens"("resourceId", "action");
