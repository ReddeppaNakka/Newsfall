import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Technology, Update } from "@/lib/types";

/**
 * GET /api/topic/[slug] — FAST path: technology + recent updates, no LLM.
 * The popup calls this first so the header and updates appear instantly.
 * The (slower) AI brief is fetched separately from /api/topic/[slug]/brief.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data: tech } = await supabase
    .from("technologies")
    .select("*")
    .eq("slug", slug)
    .single<Technology>();

  if (!tech) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: updates } = await supabase
    .from("updates")
    .select("*")
    .eq("technology_id", tech.id)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(8);

  return NextResponse.json({ technology: tech, updates: (updates ?? []) as Update[] });
}
