"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  BookOpen,
  CornerDownLeft,
  FileText,
  Loader2,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openAssistant } from "@/lib/assistant/open";
import { cn } from "@/lib/utils";

type CourseHit = {
  code: string;
  titleEn: string | null;
  titleZh: string | null;
  faculty: string | null;
  department: string | null;
  credits: string | null;
  equivalentCodes?: string[];
};

type InstructorHit = {
  name: string;
  courseCount: number;
  sampleCourse: string | null;
};

type SearchPayload = { courses: CourseHit[]; instructors: InstructorHit[] };

type PaletteItem = {
  id: string;
  kind: "course" | "instructor" | "page" | "ai";
  title: string;
  subtitle?: string;
  trailing?: string;
  href?: string;
  aka?: string;
};

type PaletteGroup = { key: string; title: string; items: PaletteItem[] };

function formatAka(codes: string[] | undefined): string | undefined {
  const list = (codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean);
  return list.length ? list.join(", ") : undefined;
}

const EMPTY: SearchPayload = { courses: [], instructors: [] };
const RECENTS_KEY = "umeh:command-palette-recents-v2";

const PAGES: PaletteItem[] = [
  { id: "page-catalog", kind: "page", title: "Courses", href: "/catalog" },
  { id: "page-timetable", kind: "page", title: "Timetable", href: "/timetable" },
  { id: "page-ai", kind: "page", title: "AI setup", href: "/ai" },
];

function readRecents(): PaletteItem[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is PaletteItem =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as PaletteItem).title === "string" &&
          typeof (item as PaletteItem).href === "string" &&
          ((item as PaletteItem).kind === "course" || (item as PaletteItem).kind === "instructor"),
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecent(item: PaletteItem) {
  if (item.kind !== "course" && item.kind !== "instructor") return;
  try {
    const next = [item, ...readRecents().filter((entry) => entry.id !== item.id)].slice(0, 5);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // private mode or full storage: recents are a convenience, not a requirement
  }
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-brand/10 px-0.5 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function itemIcon(item: PaletteItem) {
  if (item.kind === "course") return <BookOpen className="h-4 w-4" aria-hidden />;
  if (item.kind === "instructor") return <User className="h-4 w-4" aria-hidden />;
  if (item.kind === "ai") return <Sparkles className="h-4 w-4" aria-hidden />;
  return <FileText className="h-4 w-4" aria-hidden />;
}

export function CommandPalette({ variant = "header" }: { variant?: "header" | "hero" }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const signedOut = isLoaded && !isSignedIn;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [recents, setRecents] = useState<PaletteItem[]>([]);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (window.location.pathname === "/") return;
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAssistantEnabled(false);
      return;
    }
    if (!open || assistantEnabled) return;
    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.enabled === true) setAssistantEnabled(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, assistantEnabled, isLoaded, isSignedIn]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setPayload(EMPTY);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/command-palette?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : EMPTY))
        .then((body: SearchPayload) => {
          setPayload({
            courses: Array.isArray(body.courses) ? body.courses : [],
            instructors: Array.isArray(body.instructors) ? body.instructors : [],
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setPayload(EMPTY);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const term = query.trim();
    const next: PaletteGroup[] = [];

    if (!term) {
      if (recents.length > 0) next.push({ key: "recent", title: "Recent", items: recents });
      next.push({ key: "pages", title: "Pages", items: PAGES });
      return next;
    }

    const lowered = term.toLowerCase();
    const courses: PaletteItem[] = payload.courses.map((course) => ({
      id: `course-${course.code}`,
      kind: "course",
      title: course.code,
      aka: formatAka(course.equivalentCodes),
      subtitle: course.titleEn ?? undefined,
      trailing: [course.faculty, course.department].filter(Boolean).join(" / ") || undefined,
      href: `/course/${encodeURIComponent(course.code)}`,
    }));
    const instructors: PaletteItem[] = payload.instructors.map((instructor) => ({
      id: `instructor-${instructor.name}`,
      kind: "instructor",
      title: instructor.name,
      trailing: `${instructor.courseCount} courses`,
      href: `/professor/${encodeURIComponent(instructor.name).replaceAll("%2F", "$")}`,
    }));
    const pages = PAGES.filter((page) =>
      `${page.title} ${page.subtitle ?? ""}`.toLowerCase().includes(lowered),
    );

    if (courses.length) next.push({ key: "courses", title: "Courses", items: courses });
    if (instructors.length) next.push({ key: "instructors", title: "Instructors", items: instructors });
    if (pages.length) next.push({ key: "pages", title: "Pages", items: pages });
    if (assistantEnabled || signedOut) {
      next.push({
        key: "ai",
        title: signedOut ? "Sign in" : "Ask AI",
        items: [
          {
            id: "ai-ask",
            kind: "ai",
            title: signedOut ? "Sign in to ask AI" : "Ask AI",
            subtitle: term,
          },
        ],
      });
    }
    return next;
  }, [assistantEnabled, payload, query, recents, signedOut]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const choose = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      setOpen(false);
      if (item.kind === "ai") {
        if (!isLoaded) return;
        if (!isSignedIn) {
          const returnTo =
            typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
          router.push(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
          return;
        }
        const prompt = query.trim();
        openAssistant(prompt ? { prompt, autoSend: true } : {});
        return;
      }
      saveRecent(item);
      setRecents(readRecents());
      if (item.href) router.push(item.href);
    },
    [isLoaded, isSignedIn, query, router],
  );

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (flat.length ? (index + 1) % flat.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0));
    } else if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      choose(flat[active]);
    }
  };

  let cursor = -1;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setPayload(EMPTY);
        }
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={variant === "header" ? "Search" : "Search courses and instructors"}
          className={cn(
            "flex shrink-0 items-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            variant === "hero"
              ? "h-12 w-full gap-2 rounded-xl border border-border bg-background px-4 text-base text-muted-foreground shadow-xl backdrop-blur hover:bg-surface-subtle hover:text-foreground"
              : "justify-center rounded-md text-foreground hover:text-foreground/80",
          )}
        >
          {variant === "header" ? (
            <Search size={20} strokeWidth={2} aria-hidden />
          ) : (
            <>
              <Search className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">Search courses or instructors…</span>
              <kbd className="shrink-0 rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans text-[10px] leading-none">⌘K</kbd>
            </>
          )}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1299] bg-background/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[10vh] z-[1300] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-background shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150"
        >
          <DialogPrimitive.Title className="sr-only">Search courses and instructors</DialogPrimitive.Title>
          <DialogPrimitive.Description id="command-palette-description" className="sr-only">
            Search courses, instructors and pages, or ask the assistant.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-border px-4 py-3 focus-within:ring-2 focus-within:ring-brand/30">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={flat[active] ? `command-item-${flat[active].id}` : undefined}
              aria-autocomplete="list"
              aria-label="Search courses, instructors, pages"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search courses, instructors, pages…"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" aria-label="Searching" /> : null}
            <kbd className="hidden shrink-0 rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-sans text-[10px] leading-none text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>

          <div id="command-palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {flat.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results</p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="mb-2 last:mb-0">
                  <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      cursor += 1;
                      const index = cursor;
                      const selected = index === active;
                      return (
                        <button
                          key={item.id}
                          id={`command-item-${item.id}`}
                          ref={(node) => {
                            itemRefs.current[index] = node;
                          }}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(item)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                            selected ? "bg-surface-subtle" : "bg-transparent",
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                            {itemIcon(item)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm",
                                  item.kind === "course" ? "font-medium text-foreground" : "text-foreground",
                                )}
                              >
                                <Highlight text={item.title} query={query} />
                              </span>
                              {item.aka ? (
                                <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                                  a.k.a. {item.aka}
                                </span>
                              ) : null}
                              {item.subtitle ? (
                                <span className="min-w-0 truncate text-xs text-muted-foreground">
                                  <Highlight text={item.subtitle} query={query} />
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {item.trailing ? (
                            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                              {item.trailing}
                            </span>
                          ) : null}
                          <ArrowUpRight
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-opacity",
                              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            )}
                            aria-hidden
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans">↑</kbd>
              <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" aria-hidden />
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans">esc</kbd>
              close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
