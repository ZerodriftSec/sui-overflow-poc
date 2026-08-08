import { NextResponse } from "next/server";

/** Submit a wallet-signed, Enoki-sponsored transaction for execution. */

const ENOKI_API = "https://api.enoki.mystenlabs.com/v1";

type ExecuteBody = { digest?: string; signature?: string };

export async function POST(req: Request) {
  const key = process.env.ENOKI_PRIVATE_API_KEY?.trim() || "";
  if (!key) {
    return NextResponse.json({ error: "sponsorship_disabled" }, { status: 501 });
  }

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { digest, signature } = body;
  if (!digest || !signature) {
    return NextResponse.json(
      { error: "missing_fields", required: ["digest", "signature"] },
      { status: 400 }
    );
  }

  const res = await fetch(
    `${ENOKI_API}/transaction-blocks/sponsor/${digest}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signature }),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: "enoki_execute_failed", detail: json },
      { status: res.status }
    );
  }

  return NextResponse.json(json.data ?? json);
}
