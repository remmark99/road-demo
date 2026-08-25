import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createNotificationAdminClient } from "@/lib/notifications/admin"
import { NotificationDeliveryError, safeDeliveryError } from "@/lib/notifications/errors"
import { sendEventEmail } from "@/lib/notifications/email"
import { secretsEqual } from "@/lib/notifications/http"
import { sendEventToMax } from "@/lib/notifications/max"
import type { NotificationDelivery, NotificationEventPayload } from "@/lib/notifications/types"

const MAX_ATTEMPTS = 5

function isPayload(value: unknown): value is NotificationEventPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  return ["source", "event_id", "event_key", "module_name", "event_type", "message", "severity", "timestamp"]
    .every((key) => typeof payload[key] === "string")
}

function isDelivery(value: unknown): value is NotificationDelivery {
  if (!value || typeof value !== "object") return false
  const delivery = value as Record<string, unknown>
  return typeof delivery.id === "string"
    && typeof delivery.user_id === "string"
    && (delivery.channel === "email" || delivery.channel === "max")
    && typeof delivery.recipient === "string"
    && typeof delivery.attempts === "number"
    && typeof delivery.lease_token === "string"
    && isPayload(delivery.payload)
}

function retryAt(attempts: number, retryAfterSeconds?: number) {
  const exponentialSeconds = Math.min(60 * 60, 60 * (2 ** Math.max(0, attempts - 1)))
  const delaySeconds = Math.max(exponentialSeconds, retryAfterSeconds ?? 0)
  return new Date(Date.now() + delaySeconds * 1000).toISOString()
}

async function updateDelivery(
  delivery: NotificationDelivery,
  values: Record<string, unknown>,
) {
  const admin = createNotificationAdminClient()
  const { error } = await admin
    .from("notification_deliveries")
    .update(values)
    .eq("id", delivery.id)
    .eq("status", "processing")
    .eq("lease_token", delivery.lease_token)
  if (error) throw error
}

async function disableMaxRecipient(recipient: string) {
  const admin = createNotificationAdminClient()
  const { error: preferenceError } = await admin
    .from("notification_preferences")
    .update({ max_enabled: false })
    .eq("max_user_id", recipient)
  if (preferenceError) throw preferenceError

  const { error: queueError } = await admin
    .from("notification_deliveries")
    .update({ status: "cancelled", lease_until: null, lease_token: null })
    .eq("channel", "max")
    .eq("recipient", recipient)
    .eq("status", "pending")
  if (queueError) throw queueError
}

async function processDelivery(delivery: NotificationDelivery) {
  try {
    if (delivery.channel === "email") {
      await sendEventEmail(delivery.recipient, delivery.payload)
    } else {
      await sendEventToMax(delivery.recipient, delivery.payload)
    }

    await updateDelivery(delivery, {
      status: "sent",
      sent_at: new Date().toISOString(),
      lease_until: null,
      lease_token: null,
      last_error: null,
    })
    return "sent" as const
  } catch (error) {
    const deliveryError = error instanceof NotificationDeliveryError ? error : null
    const canRetry = (deliveryError?.transient ?? true) && delivery.attempts < MAX_ATTEMPTS

    if (delivery.channel === "max" && deliveryError?.disableRecipient) {
      await disableMaxRecipient(delivery.recipient).catch((disableError) => {
        console.error("Unable to disable unavailable MAX recipient", disableError)
      })
    }

    await updateDelivery(delivery, {
      status: canRetry ? "pending" : "failed",
      next_attempt_at: canRetry
        ? retryAt(delivery.attempts, deliveryError?.retryAfterSeconds)
        : new Date().toISOString(),
      lease_until: null,
      lease_token: null,
      last_error: safeDeliveryError(error),
    })
    return canRetry ? "retried" as const : "failed" as const
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.NOTIFICATION_DISPATCH_SECRET
  const authorization = request.headers.get("authorization")
  const suppliedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null

  if (!configuredSecret) {
    return NextResponse.json({ error: "Dispatcher is not configured" }, { status: 503 })
  }
  if (!secretsEqual(suppliedSecret, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workerToken = randomUUID()
  const admin = createNotificationAdminClient()
  const { data, error } = await admin.rpc("claim_notification_deliveries", {
    worker_token: workerToken,
    batch_size: 20,
  })
  if (error) {
    console.error("Notification claim error", error)
    return NextResponse.json({ error: "Unable to claim deliveries" }, { status: 500 })
  }

  const deliveries = Array.isArray(data) ? data.filter(isDelivery) : []
  const totals = { claimed: deliveries.length, sent: 0, retried: 0, failed: 0 }
  let nextIndex = 0

  const runWorker = async () => {
    while (nextIndex < deliveries.length) {
      const delivery = deliveries[nextIndex]
      nextIndex += 1
      try {
        const outcome = await processDelivery(delivery)
        totals[outcome] += 1
      } catch (deliveryError) {
        totals.failed += 1
        console.error("Notification delivery state update error", {
          deliveryId: delivery.id,
          error: safeDeliveryError(deliveryError),
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, deliveries.length) }, runWorker))

  return NextResponse.json(totals)
}
