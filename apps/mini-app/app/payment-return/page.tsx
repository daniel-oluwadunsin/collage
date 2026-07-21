"use client";

import { closeMiniApp } from "@telegram-apps/sdk-react";
import { CheckCircle2 } from "lucide-react";

import { AppProviders } from "../../components/providers";
import { AppShell, Button, StatePage } from "../../components/ui";

export default function PaymentReturnPage() {
  const close = (): void => {
    if (closeMiniApp.isAvailable()) {
      closeMiniApp(true);
      return;
    }
    const telegram = (
      window as Window & {
        Telegram?: { WebApp?: { close?: () => void } };
      }
    ).Telegram?.WebApp;
    if (telegram?.close !== undefined) {
      telegram.close();
      return;
    }

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(
      /^@/u,
      "",
    );
    if (botUsername !== undefined && botUsername.length > 0) {
      window.location.assign(`https://t.me/${botUsername}`);
      return;
    }
    window.close();
  };
  return (
    <AppProviders>
      <AppShell offline={false}>
        <StatePage
          action={
            <Button onClick={close} type="button">
              <CheckCircle2 aria-hidden="true" size={18} />
              Return to Telegram
            </Button>
          }
          description="Monnify returned your card setup to Collage. Provider verification continues on the server; reopen Collage from the group message to see the confirmed result."
          title="Payment received for verification"
          variant="pending"
        />
      </AppShell>
    </AppProviders>
  );
}
