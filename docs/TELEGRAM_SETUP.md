# Telegram Setup

The Main Mini App URL configured in BotFather is the deployed `/mini-app`
route, for example `https://collage-apiconf.onrender.com/mini-app`. The origin
root is the public Collage landing page.

1. Create the bot with BotFather and record the bot token in a secret manager.
2. Configure `/collage`, `/status`, `/rules`, `/ask`, and `/help` commands.
3. Create the Mini App short name and attach the production HTTPS Mini App URL.
4. Set `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINI_APP_SHORT_NAME`, and the public
   webhook URL.
5. Generate a random 32–256 character webhook secret using only letters,
   digits, `_`, or `-`; do not reuse the bot token.
6. Add the bot to the group, promote it to administrator, and grant **Pin
   messages**.
7. Keep privacy mode enabled. Collage handles commands, explicit mentions, and
   required membership/service updates.
8. Expose `POST /telegram/webhook` from the bot service over HTTPS.

At startup the bot registers exactly `message`, `my_chat_member`, and
`chat_member`. Telegram requests must contain the configured
`X-Telegram-Bot-Api-Secret-Token` value.

Direct Mini App actions use opaque server-issued tokens:

```text
https://t.me/<bot>/<short-name>?startapp=<opaque-token>&mode=compact
```

Validate on real Android, iOS, and Desktop Telegram clients: host theme changes,
safe areas, compact/fullscreen behavior, keyboard navigation, group-admin
checks, pinned-message create/edit, and provider-return navigation.

Assistant invocation is limited to `/ask`, an explicit `@bot` mention, or a
question sent as a reply to a bot message. The bot removes its command/mention,
parses Telegram entities using their UTF-16 offsets, and sends trusted sender,
mention, reply-target, message, and topic context to the API. The final send
uses `reply_parameters.message_id` with
`allow_sending_without_reply=true` and preserves `message_thread_id`.

“I”, “me”, and “my” always mean `message.from.id`. Anonymous administrator
messages may ask limited group-level questions, but personal questions are
refused because no individual identity can be verified.
