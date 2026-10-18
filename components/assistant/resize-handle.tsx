"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN,
  PANEL_WIDTH_STEP,
  clampPanelWidth,
  maxPanelWidth,
  readStoredPanelWidth,
  storePanelWidth,
} from "@/lib/assistant/panel-width";
import { cn } from "@/lib/utils";

export const PANEL_WIDTH_VAR = "--assistant-width";

export default function ResizeHandle({ visible }: { visible: boolean }) {
  const [width, setWidth] = useState(() =>
    clampPanelWidth(readStoredPanelWidth(), window.innerWidth),
  );
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(PANEL_WIDTH_VAR, `${width}px`);
  }, [width]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
    },
    [],
  );

  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // CopilotKit animates body margin-inline-end on every width change, which lags behind the pointer.
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.transition;
    document.body.style.transition = "none";
    return () => {
      document.body.style.transition = previous;
      storePanelWidth(widthRef.current);
    };
  }, [dragging]);

  useEffect(() => {
    if (!visible) setDragging(false);
  }, [visible]);

  if (!visible) return null;

  const commit = (next: number) => {
    const clamped = clampPanelWidth(next, window.innerWidth);
    setWidth(clamped);
    storePanelWidth(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setWidth(clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commit(width + PANEL_WIDTH_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commit(width - PANEL_WIDTH_STEP);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="調整助手寬度"
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={maxPanelWidth(window.innerWidth)}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => commit(PANEL_WIDTH_DEFAULT)}
      style={{ right: width }}
      className="group fixed inset-y-0 z-[1201] hidden w-2 translate-x-1/2 cursor-col-resize touch-none outline-none md:block"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-brand group-focus-visible:bg-brand",
          dragging && "bg-brand",
        )}
      />
    </div>
  );
}
