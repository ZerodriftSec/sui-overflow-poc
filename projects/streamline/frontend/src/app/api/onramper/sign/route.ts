import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";

export const runtime = "nodejs";

/**
 * Signs the Onramper widget's sensitive params (`signContent`) with the project
 * signing secret. Onramper requires HMAC-SHA256(signContent) → hex appended as
 * `&signature=` when signature verification is on. Secret stays server-side.
 *
 * POST { signContent }  →  { signature }
 */
function secret() {
  return process.env.ONRAMPER_SIGNING_SECRET?.trim() || "";
}

export async function POST(req: Request) {
  const key = secret();
  if (!key) {
    return NextResponse.json({ error: "signing_not_configured" }, { status: 501 });
  }
  let body: { signContent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const signContent = body.signContent?.trim();
  if (!signContent) {
    return NextResponse.json({ error: "missing_signContent" }, { status: 400 });
  }
  const signature = createHmac("sha256", key).update(signContent).digest("hex");
  return NextResponse.json({ signature });
}
