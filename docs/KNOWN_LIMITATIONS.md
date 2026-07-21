# Known Limitations and Launch Blockers

- Legal/compliance, KYC/AML, safeguarding/custody, consumer-protection, and
  privacy approval are outstanding.
- Live NIN/identity verification access/provider is not confirmed. Registration
  records NIN as `COLLECTED_UNVERIFIED` and never presents it as verified;
  production launch remains blocked until the compliance policy and approved
  verification provider are confirmed.
- Monnify tokenization, direct debit, disbursement, wallet, static-IP, limits,
  settlement timing, and MFA mode require merchant-specific enablement.
- Production OTP requires a private HTTPS SMSGate server and an online Android
  device/SIM; public cloud mode is development-only.
- Telegram cannot atomically commit `sendMessage` with the local delivery
  marker; a crash in that narrow interval can replay a notification.
- Real Telegram Android/iOS/Desktop validation and real provider sandbox/live
  certification require operator credentials and devices.
- Backup/restore and disaster-recovery exercises are operational gates.
- The MVP supports NGN only, one current Collage per Telegram chat, strict
  cycles, and no platform-funded default protection or insurance.
- Automated tests were removed after a successful verification run at the
  product owner's request. Future behavior changes therefore require restoring
  equivalent coverage before claiming regression safety.
- The assistant requires operator-selected Groq model access. Tool calling and
  `reasoning_effort` support are model-specific; an incompatible or retired
  model fails closed with the deterministic unavailable response.
- The assistant intentionally has no conversation memory, AI retry, fallback
  model/provider, direct financial mutation, or direct access to provider and
  database credentials.
