import { NextResponse } from 'next/server';

const API_BASE =
  process.env.NODERAILS_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8080';

export async function GET() {
  try {
    const upstream = await fetch(`${API_BASE}/public/supported-assets`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    const json = await upstream.json();
    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Failed to load supported assets',
        },
      },
      { status: 502 },
    );
  }
}