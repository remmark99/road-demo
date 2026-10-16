import { NextResponse } from 'next/server'
import { getActiveLicense } from '@/lib/license'
import { withDemoModules } from '@/lib/license-modules'

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
        ...(() => {
            const { modules, demo } = withDemoModules(license.modules, process.env.LICENSE_DEMO_MODULES)
            return demo.length > 0 ? { modules, demo_modules: demo } : { modules }
        })(),
        max_cameras: license.max_cameras,
    })
}
