import { NextResponse } from 'next/server'
import { getActiveLicense } from '@/lib/license'

export async function GET() {
    const license = getActiveLicense()

    if (!license) {
        return NextResponse.json(
            {
                valid: false,
                modules: [],
                error: 'License is invalid or missing',
            },
            { status: 403 }
        )
    }

    return NextResponse.json({
        valid: true,
        customer: license.customer,
        expires_at: license.expires_at,
        modules: license.modules,
        max_cameras: license.max_cameras,
    })
}
