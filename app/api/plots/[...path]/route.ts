import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import nodePath from 'node:path';

// Прокси для загрузки графиков с MCP-сервера (решает проблему Mixed Content HTTPS/HTTP)
const MCP_SERVER_URL = normalizeMcpBaseUrl(process.env.MCP_SERVER_URL || 'http://127.0.0.1:8000/mcp');
const PLOT_PROXY_TIMEOUT_MS = 10_000;
const PLOT_FILENAME_PATTERN = /^plot_\d+\.png$/;
const LOCAL_PLOTS_DIR = nodePath.join(process.cwd(), 'tmp', 'plots');

function normalizeMcpBaseUrl(rawUrl: string) {
    return rawUrl.replace(/\/$/, '').replace(/\/(?:mcp|sse)$/, '');
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: pathSegments } = await params;
        if (pathSegments.length !== 1 || !PLOT_FILENAME_PATTERN.test(pathSegments[0])) {
            return NextResponse.json(
                { error: 'Invalid plot path' },
                { status: 400 }
            );
        }

        const imagePath = pathSegments.join('/');
        const localPath = nodePath.join(LOCAL_PLOTS_DIR, imagePath);

        try {
            const localImage = await fs.readFile(localPath);

            return new NextResponse(localImage, {
                headers: {
                    'Content-Type': 'image/svg+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch (error) {
            const code = typeof error === 'object' && error && 'code' in error
                ? String((error as { code?: string }).code)
                : '';
            if (code && code !== 'ENOENT') {
                console.error('Local plot read error:', error);
            }
        }

        const imageUrl = `${MCP_SERVER_URL}/plots/${imagePath}`;
        const token = process.env.MCP_API_KEY;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PLOT_PROXY_TIMEOUT_MS);
        
        const response = await fetch(imageUrl, {
            headers: {
                'Accept': 'image/*',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
        
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
