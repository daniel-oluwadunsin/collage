"use client";

import { CheckCircle2 } from "lucide-react";

import { AppProviders } from "../../components/providers";
import { AppShell, Button, StatePage } from "../../components/ui";

export default function PaymentReturnPage() {
  const close = (): void => {
    const telegram = (
      window as Window & {
        Telegram?: { WebApp?: { close?: () => void } };
      }
    ).Telegram?.WebApp;
    if (telegram?.close !== undefined) telegram.close();
    else window.close();
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
