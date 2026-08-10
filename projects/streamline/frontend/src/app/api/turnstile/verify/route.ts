import { NextResponse } from "next/server";

/**
 * Verifies a Cloudflare Turnstile token server-side.
 * Secret key never leaves the server.
 *
 *   POST /api/turnstile/verify  { token }  →  { ok: true | false }
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const COOKIE = "sl_turnstile_ok";

function secretKey() {
  return process.env.TURNSTILE_SECRET_KEY?.trim() || "";
}

export async function POST(req: Request) {
  const secret = secretKey();
  if (!secret) {
    return NextResponse.json({ error: "turnstile_not_configured" }, { status: 501 });
  }

  let token: string | undefined;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token?.trim();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  if (ip) form.set("remoteip", ip);

  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    data = (await res.json()) as typeof data;
  } catch {
    return NextResponse.json({ error: "siteverify_failed" }, { status: 502 });
  }

  if (!data.success) {
    return NextResponse.json(
      { ok: false, error: "challenge_failed", codes: data["error-codes"] ?? [] },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ ok: true });
  // Session cookie — once per browser session ("first start"), not every page.
  response.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const ok = cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE}=1`));
  return NextResponse.json({ ok, configured: !!secretKey() });
}
