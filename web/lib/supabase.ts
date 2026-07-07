import { createClient } from "@supabase/supabase-js";
import {
  mockTechnologies,
  mockUpdates,
  mockOpportunities,
  mockJobs,
  mockLearning,
  mockRepos,
} from "./mock-data";
import type { Technology, Update } from "./types";

/**
 * Public, read-only Supabase client.
 *
 * Uses the ANON key, which is safe to expose in the browser because Row Level
 * Security (see supabase/schema.sql) only permits SELECT for anonymous users.
 * All writes happen server-side from the Python automation job (service_role key).
 *
 * This single client is reused by Server Components for SSR data fetching.
 *
 * PREVIEW MODE: if the Supabase env vars are absent, we fall back to an in-memory
 * mock client (lib/mock-data.ts) so the full UI runs with `npm run dev` and zero
 * external setup. Set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY to use a real database.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Result<T> = { data: T; error: null };

/**
 * A minimal, chainable, awaitable stand-in for the subset of the Supabase query
 * builder this app uses: from().select().order().eq().limit().single(). Each method
 * returns `this`; awaiting the builder (it's a thenable) resolves the mock rows.
 */
class MockQuery<T = unknown> implements PromiseLike<Result<T>> {
  private filters: { col: string; val: unknown }[] = [];
  private selectStr = "*";
  private isSingle = false;
  private limitN: number | null = null;

  constructor(private table: string) {}

  select(str = "*") {
    this.selectStr = str;
    return this;
  }
  // order/eq/limit mutate state and return the builder for chaining.
  order() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single<_S = T>() {
    this.isSingle = true;
    return this as unknown as MockQuery<_S>;
  }

  private compute(): unknown {
    if (this.table === "technologies") {
      let rows = [...mockTechnologies];
      for (const f of this.filters) {
        if (f.col === "slug") rows = rows.filter((t) => t.slug === f.val);
      }
      rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      if (this.isSingle) return rows[0] ?? null;
      if (this.selectStr === "slug") return rows.map((t) => ({ slug: t.slug }));
      return rows;
    }

    if (this.table === "opportunities") {
      let rows = [...mockOpportunities];
      for (const f of this.filters) {
        if (f.col === "slug") rows = rows.filter((o) => o.slug === f.val);
        if (f.col === "kind") rows = rows.filter((o) => o.kind === f.val);
        if (f.col === "country") rows = rows.filter((o) => o.country === f.val);
        if (f.col === "is_featured") rows = rows.filter((o) => o.is_featured === f.val);
      }
      // Featured first, then soonest deadline (nulls last).
      rows.sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.isSingle) return rows[0] ?? null;
      return rows;
    }

    if (this.table === "learning_resources") {
      let rows = [...mockLearning];
      for (const f of this.filters) {
        if (f.col === "kind") rows = rows.filter((r) => r.kind === f.val);
        if (f.col === "provider") rows = rows.filter((r) => r.provider === f.val);
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.isSingle) return rows[0] ?? null;
      return rows;
    }

    if (this.table === "repos") {
      let rows = [...mockRepos];
      for (const f of this.filters) {
        if (f.col === "is_good_first_issue")
          rows = rows.filter((r) => r.is_good_first_issue === f.val);
        if (f.col === "language") rows = rows.filter((r) => r.language === f.val);
      }
      rows.sort((a, b) => b.stars - a.stars);
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.isSingle) return rows[0] ?? null;
      return rows;
    }

    if (this.table === "jobs") {
      let rows = [...mockJobs];
      for (const f of this.filters) {
        if (f.col === "is_fresher") rows = rows.filter((j) => j.is_fresher === f.val);
        if (f.col === "is_remote") rows = rows.filter((j) => j.is_remote === f.val);
        if (f.col === "country") rows = rows.filter((j) => j.country === f.val);
      }
      // Fresher-friendly first, then most recently posted (nulls last).
      rows.sort((a, b) => {
        if (a.is_fresher !== b.is_fresher) return a.is_fresher ? -1 : 1;
        if (!a.posted_at) return 1;
        if (!b.posted_at) return -1;
        return b.posted_at.localeCompare(a.posted_at);
      });
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.isSingle) return rows[0] ?? null;
      return rows;
    }

    if (this.table === "updates") {
      const embed = this.selectStr.includes("technology:");
      let rows = [...mockUpdates];

      for (const f of this.filters) {
        if (f.col === "technology_id") rows = rows.filter((u) => u.technology_id === f.val);
        if (f.col === "technology.is_featured") {
          rows = rows.filter((u) => {
            const tech = mockTechnologies.find((t) => t.id === u.technology_id);
            return tech?.is_featured === f.val;
          });
        }
      }

      // published_at descending, nulls last.
      rows.sort((a, b) => {
        if (!a.published_at) return 1;
        if (!b.published_at) return -1;
        return b.published_at.localeCompare(a.published_at);
      });

      if (this.limitN != null) rows = rows.slice(0, this.limitN);

      if (embed) {
        return rows.map((u) => {
          const t = mockTechnologies.find((x) => x.id === u.technology_id)!;
          return {
            ...u,
            technology: {
              name: t.name,
              slug: t.slug,
              accent_color: t.accent_color,
              is_featured: t.is_featured,
            },
          };
        });
      }
      return rows;
    }

    return this.isSingle ? null : [];
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.compute() as T, error: null }).then(
      onfulfilled,
      onrejected
    );
  }
}

const mockClient = {
  from(table: string) {
    return new MockQuery(table);
  },
};

const useMock = !supabaseUrl || !supabaseAnonKey;

if (useMock && typeof window === "undefined") {
  // Server-side log so it's obvious why data looks canned during a preview run.
  console.warn(
    "[News_Pond] No Supabase env vars set — running in PREVIEW MODE with mock data. " +
      "Add NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to use a real database."
  );
}

export const supabase = useMock
  ? (mockClient as unknown as ReturnType<typeof createClient>)
  : createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false }, // no user auth needed for a public read-only site
    });

// Re-export domain types for convenience (and to anchor the mock's shape).
export type { Technology, Update };
