import { NextRequest, NextResponse } from 'next/server';

// Прокси для загрузки графиков с MCP-сервера (решает проблему Mixed Content HTTPS/HTTP)
const MCP_SERVER_URL = 'http://89.124.74.27:8000';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;
        const imagePath = path.join('/');
        const imageUrl = `${MCP_SERVER_URL}/plots/${imagePath}`;
        
        const response = await fetch(imageUrl, {
            headers: {
                'Accept': 'image/*',
            },
        });
        
        if (!response.ok) {
            return NextResponse.json(
                { error: 'Image not found' },
                { status: response.status }
            );
        }
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Plot proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch image' },
            { status: 500 }
        );
    }
}
