import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getBrief } from "@/lib/brief";
import type { Technology, Update } from "@/lib/types";

/**
 * GET /api/topic/[slug]/brief — SLOW path: the AI-generated, web-grounded brief.
 * Fetched separately so it never blocks the popup's header/updates from rendering.
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

  const brief = await getBrief(tech, (updates ?? []) as Update[]);
  return NextResponse.json({ brief });
}
