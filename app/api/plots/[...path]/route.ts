import { NextRequest, NextResponse } from 'next/server';

// Прокси для загрузки графиков с MCP-сервера (решает проблему Mixed Content HTTPS/HTTP)
const MCP_SERVER_URL = normalizeMcpBaseUrl(process.env.MCP_SERVER_URL || 'http://127.0.0.1:8000/mcp');

function normalizeMcpBaseUrl(rawUrl: string) {
    return rawUrl.replace(/\/$/, '').replace(/\/(?:mcp|sse)$/, '');
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;
        const imagePath = path.join('/');
        const imageUrl = `${MCP_SERVER_URL}/plots/${imagePath}`;
        const token = process.env.MCP_API_KEY;
        
        const response = await fetch(imageUrl, {
            headers: {
                'Accept': 'image/*',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
