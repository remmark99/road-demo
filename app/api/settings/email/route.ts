import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

// Configure your SMTP settings here
// For Gmail: use app password from https://myaccount.google.com/apppasswords
// For Yandex: use app password from https://id.yandex.ru/security/app-passwords
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
    },
}

const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@vector-goroda.ru"

export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json()

        if (!email || typeof email !== "string") {
            return NextResponse.json(
                { error: "Email обязателен" },
                { status: 400 }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Неверный формат email" },
                { status: 400 }
            )
        }

        // Check if SMTP is configured
        if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
            console.warn("SMTP not configured, skipping email send")
            // Return success anyway so the flow works without email
            return NextResponse.json({
                success: true,
                message: "Email сохранён (отправка письма отключена - настройте SMTP)",
            })
        }

        // Create transporter
        const transporter = nodemailer.createTransport(SMTP_CONFIG)

        // Send welcome email
        await transporter.sendMail({
            from: FROM_EMAIL,
            to: email,
            subject: "Добро пожаловать в Вектор Города!",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">🚗 Вектор Города</h1>
          <p>Здравствуйте!</p>
          <p>Вы успешно подписались на уведомления о состоянии дорог.</p>
          <p>Теперь вы будете получать оповещения о:</p>
          <ul>
            <li>🌨️ Снежных заносах</li>
            <li>🚜 Работе спецтехники</li>
            <li>🕳️ Ямах на дорогах</li>
            <li>💧 Лужах и затоплениях</li>
          </ul>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
            Это письмо было отправлено автоматически системой мониторинга дорог Вектор Города.
          </p>
        </div>
      `,
            text: `
        Вектор Города
        
        Здравствуйте!
        
        Вы успешно подписались на уведомления о состоянии дорог.
        
        Теперь вы будете получать оповещения о:
        - Снежных заносах
        - Работе спецтехники
        - Ямах на дорогах
        - Лужах и затоплениях
        
        Это письмо было отправлено автоматически системой мониторинга дорог Вектор Города.
      `,
        })

        return NextResponse.json({
            success: true,
            message: "Приветственное письмо отправлено",
        })
    } catch (error) {
        console.error("Email send error:", error)
        return NextResponse.json(
            { error: "Не удалось отправить письмо. Проверьте настройки SMTP." },
            { status: 500 }
        )
    }
}
