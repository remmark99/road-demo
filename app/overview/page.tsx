"use client";

import { SurgutMap } from "@/components/map/surgut-map";
import { Navigation } from "@/components/navigation";

export default function OverviewPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      <div className="pt-14 h-screen">
        <SurgutMap />
      </div>
    </main>
  );
}
