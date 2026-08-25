export class NotificationDeliveryError extends Error {
  readonly transient: boolean
  readonly retryAfterSeconds?: number
  readonly disableRecipient: boolean

  constructor(
    message: string,
    options: {
      transient: boolean
      retryAfterSeconds?: number
      disableRecipient?: boolean
    },
  ) {
    super(message)
    this.name = "NotificationDeliveryError"
    this.transient = options.transient
    this.retryAfterSeconds = options.retryAfterSeconds
    this.disableRecipient = options.disableRecipient ?? false
  }
}

export function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown delivery error"
  return message.replace(/[\r\n]+/g, " ").slice(0, 500)
}
