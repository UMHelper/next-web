import React, { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface SparklesTextProps {
  as?: React.ElementType;
  className?: string;
  children: React.ReactNode;
  sparklesCount?: number;
  colors?: {
    first: string;
    second: string;
  };
}

const SPARKLE_POSITIONS = [
  { x: "8%", y: "-12%", delay: "0s" },
  { x: "28%", y: "18%", delay: "0.25s" },
  { x: "48%", y: "-8%", delay: "0.5s" },
  { x: "68%", y: "14%", delay: "0.75s" },
  { x: "88%", y: "-10%", delay: "1s" },
  { x: "16%", y: "72%", delay: "1.25s" },
  { x: "40%", y: "86%", delay: "1.5s" },
  { x: "64%", y: "78%", delay: "1.75s" },
  { x: "82%", y: "66%", delay: "2s" },
  { x: "94%", y: "40%", delay: "2.25s" },
];

export const SparklesText: React.FC<SparklesTextProps> = ({
  as,
  children,
  colors = { first: "#9E7AFF", second: "#FE8BBB" },
  className,
  sparklesCount = 10,
  ...props
}) => {
  const Component = (as ?? "div") as React.ElementType;
  const sparkles = SPARKLE_POSITIONS.slice(0, Math.max(0, Math.min(sparklesCount, SPARKLE_POSITIONS.length)));

  return (
    <Component
      className={cn("relative inline-block font-bold", className)}
      {...props}
      style={
        {
          "--sparkles-first-color": colors.first,
          "--sparkles-second-color": colors.second,
        } as CSSProperties
      }
    >
      {sparkles.map((sparkle, index) => (
        <span
          key={`${sparkle.x}-${sparkle.y}`}
          aria-hidden="true"
          className="pointer-events-none absolute z-20 animate-ping text-[10px]"
          style={{
            left: sparkle.x,
            top: sparkle.y,
            color: index % 2 === 0 ? "var(--sparkles-first-color)" : "var(--sparkles-second-color)",
            animationDelay: sparkle.delay,
            animationDuration: "1.6s",
          }}
        >
          ✦
        </span>
      ))}
      <strong className="relative z-10">{children}</strong>
    </Component>
  );
};
