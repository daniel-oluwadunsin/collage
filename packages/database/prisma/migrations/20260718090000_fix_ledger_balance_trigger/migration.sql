-- A polymorphic trigger record cannot safely reference table-specific fields
-- directly. Resolve the target transaction through JSON field access instead.
CREATE OR REPLACE FUNCTION assert_balanced_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id uuid;
  entry_count bigint;
  debit_total numeric;
  credit_total numeric;
BEGIN
  target_transaction_id := COALESCE(
    (to_jsonb(NEW) ->> 'transactionId')::uuid,
    (to_jsonb(NEW) ->> 'id')::uuid
  );

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
