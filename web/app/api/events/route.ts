import { NextResponse } from "next/server";
import { listEvents } from "@/lib/intelligence";

/**
 * GET /api/events
 *   ?type=ACQUISITION&min_importance=40&min_confidence=0.5&days=7&entity=<uuid>
 *   &status=ACTIVE&limit=20&offset=0
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) == null ? undefined : Number(p.get(k)));
  const events = await listEvents({
    limit: Math.min(num("limit") ?? 20, 100),
    offset: num("offset") ?? 0,
    minImportance: num("min_importance"),
    minConfidence: num("min_confidence"),
    sinceDays: num("days"),
    type: p.get("type") ?? undefined,
    status: p.get("status") ?? undefined,
    entityId: p.get("entity") ?? undefined,
  });
  return NextResponse.json({ events, count: events.length });
}
