"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { useIsland } from "@/lib/use-island";

type SkinRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: "small" | "middle";
  /** 默认皮肤（或库未就绪）时渲染的原评分组件 */
  children: ReactNode;
};

export function SkinRating({
  value,
  onChange,
  readOnly,
  size = "small",
  children,
  ...rest
}: SkinRatingProps) {
  const lib = useIsland();

  if (!lib) {
    return isValidElement(children) ? cloneElement(children as ReactElement<object>, rest) : <>{children}</>;
  }

  const { Rate } = lib;
  return (
    <Rate
      aria-label="Rating"
      {...rest}
      value={value}
      onChange={onChange}
      readonly={readOnly}
      size={size}
      allowClear={false}
    />
  );
}
