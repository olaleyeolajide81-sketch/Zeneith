import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function GET(req: NextRequest) {
  const employer = req.nextUrl.searchParams.get("employer");
  if (!employer) return NextResponse.json({ error: "employer required" }, { status: 400 });

  const res = await fetch(`${BACKEND_URL}/viewing-key/${employer}`);
  const data = await res.json();
  return NextResponse.json(data);
}
