-- A member may retain one ACTIVE method while authorizing a replacement, but
-- concurrent add/replace requests must not create multiple pending methods.
CREATE UNIQUE INDEX "payment_methods_one_authorizing_per_member"
ON "payment_methods" ("memberId")
WHERE "state" = 'AUTHORIZING';
