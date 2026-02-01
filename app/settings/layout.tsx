import { Navigation } from "@/components/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      <div className="pt-14 h-screen flex">
        <SettingsNav />
        <div className="flex-1 p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
