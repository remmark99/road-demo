import { Navigation } from "@/components/navigation"
import { AssistantChat } from "@/components/assistant/assistant-chat"

export default function AIAssistantPage() {
  return (
    <main className="h-dvh w-full overflow-hidden bg-background">
      <Navigation />
      <div className="h-full pt-14">
        <AssistantChat />
      </div>
    </main>
  )
}
