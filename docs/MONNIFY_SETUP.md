# Monnify Setup

## Sandbox

1. Create a Monnify integration and obtain API key, secret, and contract code.
2. Confirm sandbox access for checkout, card tokenization, direct debit,
   account validation, disbursement, and wallet queries.
3. Configure transaction and disbursement webhooks to the API's
   `/webhooks/monnify` endpoint.
4. Configure the source disbursement wallet account and fund it where required.
5. Keep `PROVIDER_CALLS_ENABLED=false` until credentials and callback URLs are
   validated.

## Production enablement checklist

- card tokenization enabled for the contract;
- direct-debit mandate/debit access and limits confirmed;
- disbursement enabled;
- source wallet and settlement timing understood;
- destination account-name requirements confirmed;
- static egress IP supplied and whitelisted if Monnify requires it;
- `MONNIFY_DISBURSEMENT_MFA_MODE` selected as `disabled` only after provider
  approval, otherwise `manual` with an operator procedure;
- production webhook HMAC-SHA512 verification tested over exact raw bytes;
- documented source-IP allowlist configured as defense in depth;
- identity/NIN provider and merchant access approved;
- live limits, fees, reversals, timeouts, and support contacts recorded.

Timeout or process loss is `UNKNOWN`, never failed. Requery the original
reference before any retry. A browser redirect never marks a contribution paid.
See `docs/PROVIDER_REFERENCES.md` for the official pages consulted.
