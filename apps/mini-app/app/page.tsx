"use client";

import { CollageMiniApp } from "../components/mini-app";
import { AppProviders } from "../components/providers";

export default function MiniAppPage() {
  return (
    <AppProviders>
      <CollageMiniApp />
    </AppProviders>
  );
}
