"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { marked, type Token, type Tokens } from "marked";

import { cn } from "@/lib/utils";

const linkClass =
  "font-medium text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:text-brand-strong hover:decoration-brand";

// react-markdown 8 is the version CopilotKit already ships and works with React 18. The repo's
// remark-gfm 4 targets unified 11, so GFM tables are lexed with marked and rendered explicitly;
// everything else stays on the same ReactMarkdown component set.
const components: Components = {
  h1: ({ node: _node, level: _level, className, ...props }) => (
    <h1 className={cn("mt-4 text-base font-semibold leading-snug text-foreground first:mt-0", className)} {...props} />
  ),
  h2: ({ node: _node, level: _level, className, ...props }) => (
    <h2 className={cn("mt-4 text-sm font-semibold leading-snug text-foreground first:mt-0", className)} {...props} />
  ),
  h3: ({ node: _node, level: _level, className, ...props }) => (
    <h3 className={cn("mt-3 text-sm font-semibold leading-snug text-foreground first:mt-0", className)} {...props} />
  ),
  h4: ({ node: _node, level: _level, className, ...props }) => (
    <h4 className={cn("mt-3 text-sm font-semibold leading-snug text-foreground first:mt-0", className)} {...props} />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p className={cn("text-sm leading-relaxed [&:not(:first-child)]:mt-3", className)} {...props} />
  ),
  a: ({ node: _node, href, className, children, ...props }) => {
    const merged = cn(linkClass, className);
    if (href?.startsWith("/")) {
      return (
        <Link href={href} className={merged}>
          {children}
        </Link>
      );
    }
    const external = Boolean(href && /^https?:\/\//.test(href));
    return (
      <a
        {...props}
        href={href}
        className={merged}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  ul: ({ node: _node, depth: _depth, ordered: _ordered, className, ...props }) => (
    <ul className={cn("my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground", className)} {...props} />
  ),
  ol: ({ node: _node, depth: _depth, ordered: _ordered, className, ...props }) => (
    <ol className={cn("my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground", className)} {...props} />
  ),
  li: ({ node: _node, checked: _checked, index: _index, ordered: _ordered, className, ...props }) => (
    <li className={cn("pl-0.5 text-sm leading-relaxed", className)} {...props} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote className={cn("my-3 border-l-2 border-brand/30 pl-3 text-sm text-muted-foreground", className)} {...props} />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("my-4 border-border", className)} {...props} />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn(
        "my-3 overflow-x-auto rounded-xl border border-border bg-surface-subtle p-3 font-mono text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: ({ node: _node, inline, className, children, ...props }) => {
    const isBlock = inline === false || Boolean(className && /language-/.test(className));
    if (isBlock) {
      return (
        <code className={cn("font-mono text-xs", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ node: _node, className, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full border-collapse text-xs", className)} {...props} />
    </div>
  ),
  thead: ({ node: _node, className, ...props }) => (
    <thead className={cn("bg-surface-subtle text-left text-muted-foreground", className)} {...props} />
  ),
  th: ({ node: _node, isHeader: _isHeader, style: _style, className, ...props }) => (
    <th className={cn("border-b border-border px-2.5 py-1.5 font-medium", className)} {...props} />
  ),
  td: ({ node: _node, isHeader: _isHeader, style: _style, className, ...props }) => (
    <td className={cn("border-b border-border/60 px-2.5 py-1.5 align-top", className)} {...props} />
  ),
  img: ({ node: _node, className, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className={cn("my-3 max-w-full rounded-xl border border-border", className)} {...props} />
  ),
};

const inlineComponents: Components = {
  ...components,
  p: ({ node: _node, children }) => <>{children}</>,
};

function InlineMarkdown({ children }: { children: string }) {
  return <ReactMarkdown components={inlineComponents}>{children}</ReactMarkdown>;
}

function MarkdownTable({ token }: { token: Tokens.Table }) {
  const align = (index: number): React.CSSProperties["textAlign"] =>
    token.align[index] ?? undefined;

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-subtle text-left text-muted-foreground">
          <tr>
            {token.header.map((cell, index) => (
              <th
                key={index}
                style={{ textAlign: align(index) }}
                className="border-b border-border px-3 py-2 font-medium"
              >
                {cell.text ? <InlineMarkdown>{cell.text}</InlineMarkdown> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {token.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{ textAlign: align(cellIndex) }}
                  className={cn(
                    "px-3 py-2 align-top",
                    rowIndex === token.rows.length - 1 ? "" : "border-b border-border/60",
                  )}
                >
                  {cell.text ? <InlineMarkdown>{cell.text}</InlineMarkdown> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MarkdownSegment =
  | { kind: "markdown"; raw: string }
  | { kind: "table"; token: Tokens.Table };

function splitTableBlocks(markdown: string): MarkdownSegment[] {
  let tokens: Token[];
  try {
    tokens = marked.lexer(markdown, { gfm: true });
  } catch {
    return [{ kind: "markdown", raw: markdown }];
  }

  const segments: MarkdownSegment[] = [];
  let buffer = "";
  for (const token of tokens) {
    if (token.type === "table") {
      if (buffer.trim()) segments.push({ kind: "markdown", raw: buffer });
      buffer = "";
      segments.push({ kind: "table", token: token as Tokens.Table });
    } else {
      buffer += token.raw;
    }
  }
  if (buffer.trim()) segments.push({ kind: "markdown", raw: buffer });
  return segments;
}

export const Response = memo(function Response({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const segments = useMemo(() => splitTableBlocks(children), [children]);

  return (
    <div className={cn("min-w-0 text-foreground", className)}>
      {segments.map((segment, index) =>
        segment.kind === "table" ? (
          <MarkdownTable key={index} token={segment.token} />
        ) : (
          <ReactMarkdown key={index} components={components}>
            {segment.raw}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
});
