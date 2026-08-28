import { NextResponse } from "next/server";
import { search } from "@/lib/retrieval";

/** GET /api/search?q=…&days=30&limit=20 — semantic + lexical search over events, articles, entities. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ error: "q is required" }, { status: 400 });
  const days = Number(searchParams.get("days")) || undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
  const hits = await search(q, { sinceDays: days, limit });
  return NextResponse.json({ query: q, hits });
}
