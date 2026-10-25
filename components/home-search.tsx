"use client";

import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FileText,
  Loader2,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
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
};

type InstructorHit = { name: string; courseCount: number; sampleCourse: string | null };
type SearchPayload = { courses: CourseHit[]; instructors: InstructorHit[] };

type HomeItem = {
  id: string;
  kind: "course" | "instructor" | "tip" | "ai";
  title: string;
  subtitle?: string;
  trailing?: string;
  href?: string;
  query?: string;
};

type HomeGroup = { key: string; title: string; items: HomeItem[] };

const EMPTY: SearchPayload = { courses: [], instructors: [] };
const RECENTS_KEY = "umeh:command-palette-recents-v2";

const TIPS: HomeItem[] = [
  { id: "tip-acct1000", kind: "tip", title: "ACCT1000", query: "ACCT1000" },
  { id: "tip-acct", kind: "tip", title: "ACCT", query: "ACCT" },
  { id: "tip-instructor", kind: "tip", title: "CHAN TAI MAN", query: "CHAN TAI MAN" },
];

function readRecents(): HomeItem[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is HomeItem =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as HomeItem).title === "string" &&
          typeof (item as HomeItem).href === "string" &&
          ((item as HomeItem).kind === "course" || (item as HomeItem).kind === "instructor"),
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecent(item: HomeItem) {
  if (item.kind !== "course" && item.kind !== "instructor") return;
  try {
    const next = [item, ...readRecents().filter((entry) => entry.id !== item.id)].slice(0, 5);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // recents are optional
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

function itemIcon(item: HomeItem) {
  if (item.kind === "course" || item.kind === "tip") return <BookOpen className="h-4 w-4" aria-hidden />;
  if (item.kind === "instructor") return <User className="h-4 w-4" aria-hidden />;
  if (item.kind === "ai") return <Sparkles className="h-4 w-4" aria-hidden />;
  return <FileText className="h-4 w-4" aria-hidden />;
}

/** Inline command search for the home page, modelled on Cloudflare's big search + dropdown. */
export function HomeSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [recents, setRecents] = useState<HomeItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    if (assistantEnabled) return;
    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.enabled === true) setAssistantEnabled(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [assistantEnabled]);

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const groups = useMemo<HomeGroup[]>(() => {
    const term = query.trim();
    if (!term) {
      const next: HomeGroup[] = [];
      if (recents.length) next.push({ key: "recent", title: "Recents", items: recents });
      next.push({ key: "tips", title: "Search tips", items: TIPS });
      return next;
    }

    const lowered = term.toLowerCase();
    const courses: HomeItem[] = payload.courses.map((course) => ({
      id: `course-${course.code}`,
      kind: "course",
      title: course.code,
      subtitle: course.titleEn ?? undefined,
      trailing: [course.faculty, course.department].filter(Boolean).join(" / ") || undefined,
      href: `/course/${encodeURIComponent(course.code)}`,
    }));
    const instructors: HomeItem[] = payload.instructors.map((instructor) => ({
      id: `instructor-${instructor.name}`,
      kind: "instructor",
      title: instructor.name,
      trailing: `${instructor.courseCount} courses`,
      href: `/professor/${encodeURIComponent(instructor.name).replaceAll("%2F", "$")}`,
    }));

    const next: HomeGroup[] = [];
    if (courses.length) next.push({ key: "courses", title: "Courses", items: courses });
    if (instructors.length) next.push({ key: "instructors", title: "Instructors", items: instructors });
    if (assistantEnabled) {
      next.push({
        key: "ai",
        title: "Ask AI",
        items: [{ id: "home-ai", kind: "ai", title: "Ask AI", subtitle: term }],
      });
    }
    return next;
  }, [assistantEnabled, payload, query, recents]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = useCallback(
    (item: HomeItem | undefined) => {
      if (!item) return;
      if (item.kind === "tip") {
        setQuery(item.query ?? item.title);
        setActive(0);
        inputRef.current?.focus();
        return;
      }
      setOpen(false);
      inputRef.current?.blur();
      if (item.kind === "ai") {
        const prompt = query.trim();
        openAssistant(prompt ? { prompt } : {});
        return;
      }
      saveRecent(item);
      setRecents(readRecents());
      if (item.href) router.push(item.href);
    },
    [query, router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
  const visible = open;

  return (
    <div ref={rootRef} className="relative z-30">
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-white/20 p-2 shadow-lg ring-1 ring-border/40 backdrop-blur-md transition-shadow",
          open && "ring-2 ring-brand/30",
        )}
      >
        <div className="flex items-center gap-3 px-2 md:px-3">
          <Search className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={visible}
            aria-controls="home-search-list"
            aria-activedescendant={flat[active] ? `home-search-${flat[active].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Search courses and instructors"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search courses or instructors…"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-white caret-white outline-none placeholder:text-white/80 md:text-lg"
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-white/80" aria-label="Searching" /> : null}
          <kbd className="hidden shrink-0 rounded border border-border/60 bg-white/20 px-1.5 py-0.5 font-sans text-[11px] leading-none text-white/80 sm:inline">
            ⌘K
          </kbd>
          <button
            type="button"
            aria-label="Search"
            onClick={() => {
              if (query.trim() && flat[0]) choose(flat[0]);
              else inputRef.current?.focus();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {visible ? (
        <div
          id="home-search-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[58vh] overflow-y-auto rounded-lg border border-border bg-background p-2 shadow-xl"
        >
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
                        id={`home-search-${item.id}`}
                        ref={(node) => {
                          itemRefs.current[index] = node;
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(item)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
                          selected ? "bg-surface-subtle" : "bg-transparent",
                        )}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                          {itemIcon(item)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm text-foreground">
                              <Highlight text={item.title} query={query} />
                            </span>
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
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/20 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          Courses
        </Link>
        <Link
          href="/timetable"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/20 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          Timetable
        </Link>
        {assistantEnabled ? (
          <button
            type="button"
            onClick={() => openAssistant()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/20 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Ask AI
          </button>
        ) : null}
      </div>
    </div>
  );
}
