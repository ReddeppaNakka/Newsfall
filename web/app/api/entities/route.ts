import { NextResponse } from "next/server";
import { listEntities } from "@/lib/intelligence";

/** GET /api/entities?type=PERSON&q=musk&limit=50 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const entities = await listEntities({
    type: p.get("type") ?? undefined,
    q: p.get("q") ?? undefined,
    limit: Math.min(Number(p.get("limit")) || 60, 200),
  });
  return NextResponse.json({ entities, count: entities.length });
}
