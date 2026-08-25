import { updateEmailPreference } from "@/lib/notifications/preferences"

// Backward-compatible endpoint. It is now authenticated and fail-closed.
export async function POST(request: Request) {
    return updateEmailPreference(request, true)
}
