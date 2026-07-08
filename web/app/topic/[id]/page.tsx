import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDeepBrief } from "@/lib/brief";
import { logoFor } from "@/lib/logo";
import ImageGallery from "@/components/ImageGallery";
import type { AccentColor, Technology, Update } from "@/lib/types";

/**
 * /topic/[slug] — the full "Know more" deep-dive for a technology. Reuses the same
 * cached web-grounded brief as the popup (so opening the popup first makes this page
 * instant), and adds a relevant-image gallery, the complete brief, sources, and the
 * full update history.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  const { data } = await supabase.from("technologies").select("slug");
  return (data ?? []).map((t) => ({ id: t.slug }));
}

type Params = { params: Promise<{ id: string }> };

const ACCENT: Record<AccentColor, { text: string; ring: string; grad: string; dot: string }> = {
  violet: { text: "text-violet-300", ring: "ring-violet-400/30", grad: "from-violet-500/30 to-violet-900/10", dot: "bg-violet-400" },
  cyan: { text: "text-cyan-300", ring: "ring-cyan-400/30", grad: "from-cyan-500/30 to-cyan-900/10", dot: "bg-cyan-400" },
  emerald: { text: "text-emerald-300", ring: "ring-emerald-400/30", grad: "from-emerald-500/30 to-emerald-900/10", dot: "bg-emerald-400" },
};

function List({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-zinc-300">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-white/5 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-200">{value}</div>
    </div>
  );
}

export default async function TopicPage({ params }: Params) {
  const { id } = await params;

  const { data: tech } = await supabase
    .from("technologies")
    .select("*")
    .eq("slug", id)
    .single<Technology>();

  if (!tech) notFound();

  const { data: updates } = await supabase
    .from("updates")
    .select("*")
    .eq("technology_id", tech.id)
    .order("published_at", { ascending: false, nullsFirst: false });

  const list = (updates ?? []) as Update[];
  const brief = await getDeepBrief(tech, list); // richer, web-grounded, cached 24h (with images)
  const accent = ACCENT[tech.accent_color] ?? ACCENT.violet;
  const logo = logoFor(tech.image_url, tech.homepage_url);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-200"
      >
        <svg className="h-4 w-4 rotate-180" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        Back to dashboard
      </Link>

      {/* Hero */}
      <div className="glass relative mt-6 overflow-hidden rounded-3xl p-8">
        <div className="flex items-center gap-4">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${accent.grad}`}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={tech.name} className="h-9 w-9 object-contain" />
            ) : (
              <span className="text-3xl font-bold text-white/90">{tech.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-widest text-zinc-500">{tech.category}</span>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{tech.name}</h1>
          </div>
          {tech.current_version && (
            <span className={`ml-auto shrink-0 rounded-full border border-white/10 px-3 py-1 text-sm ${accent.text}`}>
              v{tech.current_version}
            </span>
          )}
        </div>

        {(brief?.overview || tech.tagline || tech.description) && (
          <p className="mt-5 leading-relaxed text-zinc-300">
            {brief?.overview || tech.description || tech.tagline}
          </p>
        )}

        {tech.homepage_url && (
          <a
            href={tech.homepage_url}
            target="_blank"
            rel="noreferrer"
            className={`mt-5 inline-block text-sm font-medium ${accent.text} hover:underline`}
          >
            Visit official site ↗
          </a>
        )}
      </div>

      {/* Relevant image gallery (web-sourced) — click to enlarge in an in-app lightbox */}
      {brief && brief.images.length > 0 && (
        <section className="mt-8">
          <ImageGallery images={brief.images} alt={tech.name} variant="grid" />
        </section>
      )}

      {/* Full deep-dive brief */}
      {brief ? (
        <section className="mt-10 space-y-10">
          {/* In depth — long-form explanation */}
          {(brief.deep_overview || brief.how_it_works.length > 0) && (
            <div>
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-white">In depth</h2>
              {brief.deep_overview
                .split(/\n\n+/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="mb-3 leading-relaxed text-zinc-300">
                    {para}
                  </p>
                ))}
              {brief.how_it_works.length > 0 && (
                <div className="mt-4">
                  <List title="How it works" items={brief.how_it_works} dot={accent.dot} />
                </div>
              )}
            </div>
          )}

          {(brief.created_by || brief.released || brief.pricing) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Meta label="Created by" value={brief.created_by} />
              <Meta label="Released" value={brief.released} />
              <Meta label="Pricing" value={brief.pricing} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <List title="Key features" items={brief.features} dot={accent.dot} />
            <List title="Advantages" items={brief.advantages} dot="bg-emerald-400" />
            <List title="Limitations" items={brief.disadvantages} dot="bg-rose-400" />
            <List title="Where to use it" items={brief.use_cases} dot={accent.dot} />
          </div>

          {/* Key concepts */}
          {brief.key_concepts.length > 0 && (
            <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/5">
              <List title="Key concepts to know" items={brief.key_concepts} dot={accent.dot} />
            </div>
          )}

          {/* Getting started */}
          {brief.how_to_get_started.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                How to get started
              </h3>
              <ol className="space-y-2">
                {brief.how_to_get_started.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-zinc-300">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold ${accent.text}`}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Comparison + alternatives */}
          {(brief.comparison || brief.alternatives.length > 0) && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {brief.comparison && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    How it compares
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-300">{brief.comparison}</p>
                </div>
              )}
              <List title="Alternatives" items={brief.alternatives} dot="bg-amber-400" />
            </div>
          )}

          {/* Who is it for */}
          {brief.who_is_it_for.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Who is it for</h3>
              <div className="flex flex-wrap gap-2">
                {brief.who_is_it_for.map((w, i) => (
                  <span key={i} className="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-200 ring-1 ring-white/10">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {brief.value && (
            <div className={`rounded-2xl bg-gradient-to-r ${accent.grad} px-5 py-4 ring-1 ${accent.ring}`}>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-300">Why it matters</h3>
              <p className="text-zinc-200">{brief.value}</p>
            </div>
          )}

          {/* FAQs */}
          {brief.faqs.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-semibold tracking-tight text-white">FAQ</h2>
              <div className="space-y-3">
                {brief.faqs.map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/5">
                    <h4 className="font-medium text-zinc-100">{f.q}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          <div className="border-t border-white/5 pt-5">
            {brief.sources.length > 0 ? (
              <>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Sources
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    web-verified
                  </span>
                </h3>
                <ul className="space-y-1">
                  {brief.sources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noreferrer" className={`text-xs ${accent.text} hover:underline`}>
                        [{i + 1}] {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              !brief.grounded && (
                <p className="text-xs text-zinc-500">
                  ⚠ Written from the AI model&apos;s general knowledge (no live web sources) — may be less
                  precise for new or niche tools.
                </p>
              )
            )}
          </div>
        </section>
      ) : (
        <p className="mt-8 rounded-2xl bg-white/5 px-5 py-4 text-sm text-zinc-500">
          A detailed summary isn&apos;t available right now — showing the update history below.
        </p>
      )}

      {/* Update history */}
      <section className="mt-12">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-100">Update history</h2>

        {list.length === 0 ? (
          <p className="text-zinc-500">No updates scraped yet — the daily job will populate this soon.</p>
        ) : (
          <ol className="relative border-l border-white/10 pl-6">
            {list.map((u) => (
              <li key={u.id} className="mb-8 last:mb-0">
                <span className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ${accent.dot}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <time className="text-xs text-zinc-500">
                    {u.published_at ? new Date(u.published_at).toLocaleDateString() : "recent"}
                  </time>
                  {u.version && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-zinc-300">v{u.version}</span>
                  )}
                </div>
                <a
                  href={u.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-lg font-medium text-zinc-100 hover:text-white"
                >
                  {u.title}
                </a>
                {u.summary && <p className="mt-1 text-zinc-400">{u.summary}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
