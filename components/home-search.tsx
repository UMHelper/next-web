"use client";

import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FileText,
  Loader2,
  LogIn,
  MessageCircle,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openAssistant } from "@/lib/assistant/open";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSearchPath } from "@/lib/site";
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

type InstructorHit = { name: string; courseCount: number; sampleCourse: string | null };
type SearchPayload = { courses: CourseHit[]; instructors: InstructorHit[] };

type HomeItem = {
  id: string;
  kind: "course" | "instructor" | "tip" | "ai" | "search";
  title: string;
  subtitle?: string;
  trailing?: string;
  href?: string;
  query?: string;
  icon?: "course" | "instructor" | "prompt";
  searchType?: "course" | "instructor";
  aka?: string;
};

type HomeGroup = {
  key: string;
  title: string;
  items: HomeItem[];
  section?: string;
  kind?: "skeleton" | "empty";
  emptyTitle?: string;
  emptyDetail?: string;
};

const EMPTY: SearchPayload = { courses: [], instructors: [] };
const RECENTS_KEY = "umeh:command-palette-recents-v2";

const COURSE_CODE = /^[A-Za-z]{4}\d{4}$/;

const TIPS: HomeItem[] = [
  {
    id: "tip-accounting",
    kind: "tip",
    title: "Which courses cover accounting?",
    query: "Which courses cover accounting?",
    icon: "prompt",
  },
  {
    id: "tip-credits",
    kind: "tip",
    title: "What is ACCT1000? How many credits?",
    query: "What is ACCT1000? How many credits?",
    icon: "prompt",
  },
  {
    id: "tip-meets",
    kind: "tip",
    title: "When does ACCT1000 meet?",
    query: "When does ACCT1000 meet?",
    icon: "prompt",
  },
];

function formatAka(codes: string[] | undefined): string | undefined {
  const list = (codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean);
  return list.length ? list.join(", ") : undefined;
}

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
      <mark className="rounded-sm bg-brand/30 px-0.5 text-background">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function itemIcon(item: HomeItem) {
  if (item.kind === "tip") {
    if (item.icon === "prompt") return <MessageCircle className="h-4 w-4" aria-hidden />;
    return item.icon === "instructor"
      ? <User className="h-4 w-4" aria-hidden />
      : <BookOpen className="h-4 w-4" aria-hidden />;
  }
  if (item.kind === "course") return <BookOpen className="h-4 w-4" aria-hidden />;
  if (item.kind === "instructor") return <User className="h-4 w-4" aria-hidden />;
  if (item.kind === "ai") return <Sparkles className="h-4 w-4" aria-hidden />;
  if (item.kind === "search") return <Search className="h-4 w-4" aria-hidden />;
  return <FileText className="h-4 w-4" aria-hidden />;
}

function ResultSkeleton() {
  return (
    <div data-testid="home-search-skeleton" className="space-y-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-transparent px-3 py-2.5"
        >
          <Skeleton className="h-4 w-4 shrink-0 rounded bg-background/20" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/3 bg-background/20" />
            <Skeleton className="h-2.5 w-1/2 bg-background/10" />
          </div>
          <Skeleton className="h-3 w-8 shrink-0 bg-background/10" />
        </div>
      ))}
    </div>
  );
}

/** Inline command search for the home page, modelled on Cloudflare's big search + dropdown. */
export function HomeSearch() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const signedOut = isLoaded && !isSignedIn;
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
    if (!isLoaded || !isSignedIn) {
      setAssistantEnabled(false);
      return;
    }
    if (assistantEnabled) return;
    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.enabled === true) setAssistantEnabled(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [assistantEnabled, isLoaded, isSignedIn]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setPayload(EMPTY);
      setLoading(false);
      return;
    }

    setPayload(EMPTY);
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
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

  const signInToAsk = useCallback(() => {
    const returnTo = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
    router.push(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  }, [router]);

  const requestAssistant = useCallback(
    (detail: Parameters<typeof openAssistant>[0] = {}) => {
      if (!isLoaded) return;
      if (!isSignedIn) {
        signInToAsk();
        return;
      }
      setOpen(false);
      inputRef.current?.blur();
      openAssistant(detail);
    },
    [isLoaded, isSignedIn, signInToAsk],
  );

  const askAi = () => {
    const prompt = query.trim();
    requestAssistant(prompt ? { prompt, autoSend: true } : {});
  };

  const groups = useMemo<HomeGroup[]>(() => {
    const term = query.trim();
    const aiItem: HomeItem | null =
      assistantEnabled || signedOut
        ? {
            id: "home-ai",
            kind: "ai",
            title: signedOut ? "Sign in to ask AI" : "Ask AI",
            subtitle: term || undefined,
          }
        : null;

    if (!term) {
      const next: HomeGroup[] = [];
      if (aiItem) next.push({ key: "ai", title: "", items: [aiItem] });
      if (recents.length) next.push({ key: "recent", title: "Recents", items: recents });
      next.push({ key: "tips", title: "Try asking", items: TIPS });
      return next;
    }

    if (COURSE_CODE.test(term)) {
      const next: HomeGroup[] = [];
      if (loading) {
        next.push({ key: "skeleton", title: "", kind: "skeleton", items: [] });
      } else {
        const code = term.toUpperCase();
        const course = payload.courses.find(
          (entry) =>
            entry.code.toUpperCase() === code ||
            entry.equivalentCodes?.some((equivalent) => equivalent.toUpperCase() === code),
        );
        if (course) {
          next.push({
            key: "course",
            title: "",
            items: [
              {
                id: `course-${course.code}`,
                kind: "course",
                title: course.code,
                aka: formatAka(course.equivalentCodes),
                subtitle: course.titleEn ?? undefined,
                trailing: [course.faculty, course.department].filter(Boolean).join(" / ") || undefined,
                href: `/course/${encodeURIComponent(course.code)}`,
              },
            ],
          });
        } else {
          next.push({
            key: "empty",
            title: "",
            kind: "empty",
            emptyTitle: "No matching course.",
            emptyDetail: "Maybe the course code is incorrect?",
            items: [],
          });
        }
      }
      if (aiItem) next.push({ key: "ai", title: "", items: [aiItem] });
      return next;
    }

    const searchItems: HomeItem[] = [
      {
        id: "home-search-course",
        kind: "search",
        title: `Search Courses for “${term}”`,
        query: term,
        searchType: "course",
      },
      {
        id: "home-search-instructor",
        kind: "search",
        title: `Search Instructors for “${term}”`,
        query: term,
        searchType: "instructor",
      },
    ];

    const next: HomeGroup[] = [];
    if (aiItem) next.push({ key: "ai", title: "", items: [aiItem] });
    next.push({ key: "search", title: "Search", items: searchItems });

    if (loading) {
      next.push({ key: "skeleton", title: "", kind: "skeleton", items: [] });
      return next;
    }

    const courses: HomeItem[] = payload.courses.map((course) => ({
      id: `course-${course.code}`,
      kind: "course",
      title: course.code,
      aka: formatAka(course.equivalentCodes),
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

    if (courses.length) next.push({ key: "courses", title: "Courses", items: courses });
    if (instructors.length) next.push({ key: "instructors", title: "Instructors", items: instructors });
    if (courses.length === 0 && instructors.length === 0) {
      next.push({
        key: "empty",
        title: "",
        kind: "empty",
        emptyTitle: "No matches.",
        emptyDetail: "Check the course code or instructor name.",
        items: [],
      });
    }
    return next;
  }, [assistantEnabled, loading, payload, query, recents, signedOut]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    setActive(0);
  }, [assistantEnabled, query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const choose = useCallback(
    (item: HomeItem | undefined) => {
      if (!item) return;
      if (item.kind === "tip") {
        setOpen(false);
        inputRef.current?.blur();
        requestAssistant({ prompt: item.query ?? item.title, autoSend: true });
        return;
      }
      if (item.kind === "search") {
        setOpen(false);
        inputRef.current?.blur();
        router.push(buildSearchPath(item.searchType ?? "course", item.query ?? query.trim()));
        return;
      }
      setOpen(false);
      inputRef.current?.blur();
      if (item.kind === "ai") {
        const prompt = query.trim();
        requestAssistant(prompt ? { prompt, autoSend: true } : {});
        return;
      }
      saveRecent(item);
      setRecents(readRecents());
      if (item.href) router.push(item.href);
    },
    [query, requestAssistant, router],
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
  let currentSection: string | undefined;
  const visible = open;

  return (
    <div ref={rootRef} className="relative z-30 text-left">
      <div className="relative">
        <div
          className={cn(
            "rounded-lg border border-border/60 bg-foreground/40 p-2 shadow-md ring-1 ring-border/40 backdrop-blur-md transition-shadow",
            open && "ring-brand/30",
          )}
        >
          <div className="flex items-center gap-3 px-2 md:px-3">
            <Search className="h-5 w-5 shrink-0 text-background/80" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
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
              className="h-12 min-w-0 flex-1 bg-transparent text-base text-background caret-background outline-none placeholder:text-background/80 md:text-lg"
            />
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-background/80" aria-label="Searching" /> : null}
            <kbd className="hidden shrink-0 rounded border border-border/60 bg-white/20 px-1.5 py-0.5 font-sans text-[11px] leading-none text-background/80 sm:inline">
              ⌘K
            </kbd>
            <button
              type="button"
              aria-label={signedOut ? "Sign in to ask AI" : "Ask AI"}
              onClick={askAi}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 text-xs font-medium text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong"
            >
              {signedOut ? (
                <LogIn className="h-4 w-4" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">{signedOut ? "Sign in" : "Ask AI"}</span>
            </button>
          </div>
        </div>

        {visible ? (
          <div
            id="home-search-list"
            role="listbox"
            aria-busy={loading}
            className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[58vh] overflow-y-auto rounded-lg border border-border/60 bg-foreground/80 p-2 text-left text-background shadow-xl backdrop-blur-xl"
          >
            {flat.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-background/80">No results</p>
            ) : (
              groups.map((group) => {
                const showSection = Boolean(group.section && group.section !== currentSection);
                if (group.section) currentSection = group.section;
                return (
                  <div key={group.key} className="mb-2 last:mb-0">
                    {showSection ? (
                      <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-background/80">
                        {group.section}
                      </div>
                    ) : null}
                    {group.title ? (
                      <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-background/60">
                        {group.title}
                      </div>
                    ) : null}
                    {group.kind === "skeleton" ? <ResultSkeleton /> : null}
                    {group.kind === "empty" ? (
                      <div className="px-3 py-8 text-center">
                        <p className="text-sm text-background">{group.emptyTitle ?? "No matches."}</p>
                        <p className="mt-1 text-xs text-background/60">
                          {group.emptyDetail ?? "Check the spelling and try again."}
                        </p>
                      </div>
                    ) : null}
                    {group.items.length > 0 ? (
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          cursor += 1;
                          const index = cursor;
                          const selected = index === active;
                          const isTip = item.kind === "tip";
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
                                "group flex w-full items-center gap-2.5 rounded-lg text-left text-sm transition-colors",
                                isTip
                                  ? "border border-border/60 bg-white/20 px-3 py-2.5 hover:bg-white/30"
                                  : "px-2 py-2.5",
                                selected ? "bg-white/20" : "",
                              )}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-background/80">
                                {itemIcon(item)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-sm text-background">
                                    <Highlight text={item.title} query={query} />
                                  </span>
                                  {item.aka ? (
                                    <span className="shrink-0 whitespace-nowrap text-[11px] text-background/60">
                                      a.k.a. {item.aka}
                                    </span>
                                  ) : null}
                                  {item.subtitle ? (
                                    <span className="min-w-0 truncate text-xs text-background/80">
                                      <Highlight text={item.subtitle} query={query} />
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              {item.trailing ? (
                                <span className="hidden shrink-0 text-[11px] text-background/80 sm:inline">
                                  {item.trailing}
                                </span>
                              ) : null}
                              <ArrowUpRight
                                className={cn(
                                  "h-4 w-4 shrink-0 text-background/80 transition-opacity",
                                  isTip || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                )}
                                aria-hidden
                              />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/20 px-3 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          Courses
        </Link>
        <Link
          href="/timetable"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/20 px-3 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          Timetable
        </Link>
        <button
          type="button"
          onClick={() => requestAssistant()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/20 px-3 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          {signedOut ? <LogIn className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {signedOut ? "Sign in" : "Ask AI"}
        </button>
      </div>
    </div>
  );
}
