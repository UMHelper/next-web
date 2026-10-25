import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const bubbleVariants = cva(
  "relative flex w-fit max-w-[85%] min-w-0 flex-col gap-1 [&>[data-slot=bubble-content]]:rounded-2xl",
  {
    variants: {
      variant: {
        default:
          "[&>[data-slot=bubble-content]]:bg-primary [&>[data-slot=bubble-content]]:text-primary-foreground",
        brand:
          "[&>[data-slot=bubble-content]]:bg-brand [&>[data-slot=bubble-content]]:text-brand-foreground",
        secondary:
          "[&>[data-slot=bubble-content]]:bg-secondary [&>[data-slot=bubble-content]]:text-secondary-foreground",
        muted:
          "[&>[data-slot=bubble-content]]:bg-muted [&>[data-slot=bubble-content]]:text-foreground",
        outline:
          "[&>[data-slot=bubble-content]]:border [&>[data-slot=bubble-content]]:border-border [&>[data-slot=bubble-content]]:bg-background",
        ghost:
          "[&>[data-slot=bubble-content]]:rounded-none [&>[data-slot=bubble-content]]:bg-transparent [&>[data-slot=bubble-content]]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    align?: "start" | "end";
  }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(
        bubbleVariants({ variant }),
        align === "end" ? "self-end" : "self-start",
        className,
      )}
      {...props}
    />
  );
}

function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        "w-fit max-w-full min-w-0 overflow-hidden border border-transparent px-3.5 py-2 text-sm leading-relaxed break-words",
        className,
      )}
      {...props}
    />
  );
}

export { Bubble, BubbleContent, bubbleVariants };
