import { Navigation } from "@/components/navigation";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      <div className="pt-14">
        {children}
      </div>
    </main>
  );
}
