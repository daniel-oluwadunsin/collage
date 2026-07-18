DROP INDEX IF EXISTS "webhook_events_provider_providerEnvironment_providerEventId_key";

CREATE INDEX "webhook_events_provider_providerEnvironment_providerEventId_idx"
ON "webhook_events" ("provider", "providerEnvironment", "providerEventId");
