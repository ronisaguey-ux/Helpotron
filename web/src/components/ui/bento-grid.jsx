// Aceternity UI — Bento Grid (08-28 integration)
// Ported from ui.aceternity.com registry (bento-grid). `React.ReactNode` types
// stripped for JSX; icons passed through as-is (lucide works fine).
import { cn } from "@/lib/utils";

export const BentoGrid = ({ className, children }) => {
  return (
    <div
      className={cn(
        /* 08-29 mobile audit: `md:auto-rows-[18rem]` fixed the row height, so
           any longer description clipped at 768–1023px. minmax lets rows grow
           to fit; column switch moves to lg so tablets keep the stacked
           layout instead of three stretched columns. */
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[minmax(18rem,auto)] lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}) => {
  return (
    <div
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition duration-200 hover:shadow-xl hover:border-[var(--border-hover)]",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-2">
        {icon}
        <div className="mt-2 mb-2 font-sans font-bold text-[var(--text-primary)]">
          {title}
        </div>
        <div className="font-sans text-xs font-normal text-[var(--text-muted)]">
          {description}
        </div>
      </div>
    </div>
  );
};
