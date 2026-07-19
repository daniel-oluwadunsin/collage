INSERT INTO "outbox_events" (
  "id",
  "eventType",
  "aggregateType",
  "aggregateId",
  "aggregateVersion",
  "schemaVersion",
  "correlationId",
  "payload",
  "occurredAt",
  "publishAttempts"
)
SELECT
  gen_random_uuid(),
  'registration.completed',
  'collage-member',
  member."id"::text,
  member."version",
  1,
  'migration:recover-registration-notifications',
  jsonb_build_object(
    'collageId', member."collageId",
    'memberId', member."id"
  ),
  now(),
  0
FROM "collage_members" AS member
WHERE
  member."state" = 'REGISTERED'
  AND NOT EXISTS (
    SELECT 1
    FROM "outbox_events" AS event
    WHERE
      event."eventType" = 'registration.completed'
      AND event."aggregateType" = 'collage-member'
      AND event."aggregateId" = member."id"::text
  );
