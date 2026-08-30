import Link from "next/link";

/** "WHILE YOU WERE AWAY ——————— See all updates →" */
export default function SectionHeading({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.2em] text-zinc-100">
        {icon && <span className="text-violet-300">{icon}</span>}
        {title}
      </h2>
      {action && (
        <Link href={action.href} className="group flex items-center gap-1.5 text-[12px] text-zinc-400 transition hover:text-white">
          {action.label}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      )}
    </div>
  );
}
