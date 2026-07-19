UPDATE "collage_members" AS member
SET "preferredChargeRule" =
  CASE collage."frequency"
    WHEN 'DAILY' THEN jsonb_build_object(
      'kind', 'DAILY',
      'hour', split_part(member."preferredChargeRule"->>'time', ':', 1)::int,
      'minute', split_part(member."preferredChargeRule"->>'time', ':', 2)::int
    )
    WHEN 'WEEKLY' THEN jsonb_build_object(
      'kind', 'WEEKLY',
      'weekday', CASE
        WHEN (member."preferredChargeRule"->>'dayOfWeek')::int = 0 THEN 7
        ELSE (member."preferredChargeRule"->>'dayOfWeek')::int
      END,
      'hour', split_part(member."preferredChargeRule"->>'time', ':', 1)::int,
      'minute', split_part(member."preferredChargeRule"->>'time', ':', 2)::int
    )
    WHEN 'MONTHLY' THEN jsonb_build_object(
      'kind', 'MONTHLY',
      'ordinal', CASE member."preferredChargeRule"->>'weekOfMonth'
        WHEN 'FIRST' THEN to_jsonb(1)
        WHEN 'SECOND' THEN to_jsonb(2)
        WHEN 'THIRD' THEN to_jsonb(3)
        WHEN 'FOURTH' THEN to_jsonb(4)
        ELSE to_jsonb('last'::text)
      END,
      'weekday', CASE
        WHEN (member."preferredChargeRule"->>'dayOfWeek')::int = 0 THEN 7
        ELSE (member."preferredChargeRule"->>'dayOfWeek')::int
      END,
      'hour', split_part(member."preferredChargeRule"->>'time', ':', 1)::int,
      'minute', split_part(member."preferredChargeRule"->>'time', ':', 2)::int
    )
    WHEN 'YEARLY' THEN jsonb_build_object(
      'kind', 'YEARLY',
      'month', (member."preferredChargeRule"->>'month')::int,
      'day', (member."preferredChargeRule"->>'dayOfMonth')::int,
      'hour', split_part(member."preferredChargeRule"->>'time', ':', 1)::int,
      'minute', split_part(member."preferredChargeRule"->>'time', ':', 2)::int
    )
  END
FROM "collages" AS collage
WHERE
  member."collageId" = collage."id"
  AND member."preferredChargeRule" IS NOT NULL
  AND NOT (member."preferredChargeRule" ? 'kind');
