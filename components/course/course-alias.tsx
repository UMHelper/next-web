import { cn } from "@/lib/utils";

type CourseAliasProps = {
  codes?: string[] | null;
  variant?: "header" | "card" | "plain";
  className?: string;
};

function normalizeCodes(codes?: string[] | null) {
  if (!Array.isArray(codes)) return [];
  return Array.from(
    new Set(
      codes
        .filter((code): code is string => typeof code === "string")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

/**
 * "a.k.a." label for historical course codes.
 *
 * The primary code is already the page/card heading, so only the historical
 * codes are shown here. Header variant is a low-contrast pill on the brand
 * gradient; card variant is a small muted line.
 */
export function CourseAlias({ codes, variant = "card", className }: CourseAliasProps) {
  const normalized = normalizeCodes(codes);
  if (normalized.length === 0) return null;

  if (variant === "plain") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 text-white/80",
          className,
        )}
      >
        <span className="text-[11px] font-medium tracking-wide text-white/60">
          a.k.a.
        </span>
        <span className="font-mono text-sm font-medium tracking-wide">
          {normalized.join(" · ")}
        </span>
      </div>
    );
  }

  if (variant === "header") {
    return (
      <div
        className={cn(
          "inline-flex flex-wrap items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/90 ring-1 ring-inset ring-white/20",
          className,
        )}
      >
        <span className="text-[10px] font-medium tracking-wide text-white/60">
          a.k.a.
        </span>
        {normalized.map((code, index) => (
          <span key={code} className="inline-flex items-center">
            {index > 0 ? <span className="mr-1.5 text-white/40">·</span> : null}
            <span className="font-mono font-semibold tracking-wide">{code}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[11px] leading-none text-muted-foreground",
        className,
      )}
    >
      <span className="font-medium tracking-wide">a.k.a.</span>
      <span className="font-mono">{normalized.join(" · ")}</span>
    </div>
  );
}
