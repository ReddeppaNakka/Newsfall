import Link from "next/link";
import type { EntityRef } from "@/lib/intelligence-types";
import { ENTITY_TYPE_LABEL } from "@/lib/format";

const DOT: Record<string, string> = {
  PERSON: "bg-amber-300", COMPANY: "bg-sky-300", STARTUP: "bg-sky-300", INVESTOR: "bg-violet-300", FUND: "bg-violet-300",
  TECHNOLOGY: "bg-emerald-300", PRODUCT: "bg-emerald-300", RESEARCH_LAB: "bg-teal-300", GOVERNMENT: "bg-rose-300",
  ORGANIZATION: "bg-zinc-300", INDUSTRY: "bg-zinc-300",
};

export default function EntityChip({ entity, role }: { entity: EntityRef; role?: string }) {
  return (
    <Link
      href={`/entities/${entity.slug}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.06]"
      title={`${ENTITY_TYPE_LABEL[entity.entity_type] ?? entity.entity_type}${role ? ` · ${role.toLowerCase()}` : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[entity.entity_type] ?? "bg-zinc-300"}`} />
      {entity.name}
    </Link>
  );
}
