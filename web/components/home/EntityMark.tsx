import type { EntityRef } from "@/lib/intelligence-types";
import { logoFor } from "@/lib/logo";

/**
 * Small entity mark: the real logo (via the entity's official domain, learned by the
 * pipeline) with a neutral initials tile as the automatic fallback — never broken.
 */
export default function EntityMark({ entity, size = 24 }: { entity: Pick<EntityRef, "name" | "official_url" | "image_url">; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoFor(entity.image_url ?? null, entity.official_url ?? null, entity.name) ?? ""}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-md bg-white/10 object-contain ring-1 ring-white/10"
      style={{ width: size, height: size }}
    />
  );
}
