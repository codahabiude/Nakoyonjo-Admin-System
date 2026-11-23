"use client";

import { AppShell } from "@/components/app/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { InstallPrompt } from "@/components/install-prompt";

export default function Home() {
  return (
    <>
      <AppShell />
      <Toaster position="top-right" richColors closeButton />
      <InstallPrompt />
    </>
  );
}
