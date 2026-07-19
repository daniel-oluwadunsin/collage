WITH repaired AS (
  UPDATE "collages" AS collage
  SET
    "state" = 'STARTING',
    "version" = collage."version" + 1,
    "updatedAt" = now()
  WHERE
    collage."state" = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1
      FROM "cycles" AS cycle
      WHERE cycle."collageId" = collage."id"
    )
    AND (
      SELECT count(*)
      FROM "collage_members" AS member
      WHERE
        member."collageId" = collage."id"
        AND member."state" = 'REGISTERED'
    ) = collage."participantLimit"
  RETURNING collage."id", collage."version"
)
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
  'collage.start.requested',
  'collage',
  repaired."id"::text,
  repaired."version",
  1,
  'migration:recover-incomplete-active-collage',
  jsonb_build_object('collageId', repaired."id"),
  now(),
  0
FROM repaired;
