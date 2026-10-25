"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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

export default function ResizeHandle({
  visible,
  panelRef,
}: {
  visible: boolean;
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const [width, setWidth] = useState(() =>
    clampPanelWidth(readStoredPanelWidth(), window.innerWidth),
  );
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragRef = useRef<{ pointerId: number; cleanup: () => void } | null>(null);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(PANEL_WIDTH_VAR, `${width}px`);
    const panel = panelRef?.current;
    if (panel) {
      panel.style.setProperty(PANEL_WIDTH_VAR, `${width}px`);
      panel.style.width = window.innerWidth >= 768 ? `${width}px` : "";
    }
  }, [width, panelRef]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
      const panel = panelRef?.current;
      if (panel) panel.style.width = "";
    },
    [panelRef],
  );

  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!visible) dragRef.current?.cleanup();
  }, [visible]);

  useEffect(
    () => () => {
      dragRef.current?.cleanup();
    },
    [],
  );

  // Write the CSS variable and the panel's inline width in the same tick as the
  // pointer event. The panel must not wait for a React commit or a CSS variable
  // inheritance pass before it follows the handle.
  const applyWidth = (next: number) => {
    const clamped = clampPanelWidth(next, window.innerWidth);
    widthRef.current = clamped;
    document.documentElement.style.setProperty(PANEL_WIDTH_VAR, `${clamped}px`);
    const panel = panelRef?.current;
    if (panel) {
      panel.style.setProperty(PANEL_WIDTH_VAR, `${clamped}px`);
      panel.style.width = window.innerWidth >= 768 ? `${clamped}px` : "";
    }
    setWidth(clamped);
    return clamped;
  };

  const commit = (next: number) => {
    storePanelWidth(applyWidth(next));
  };

  // Pointer capture is unreliable for elements portalled to the body in some
  // browsers, so the gesture listens on the window until release. This also
  // removes the one-render delay between pointerdown and the first move.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();

    const pointerId = event.pointerId;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      applyWidth(window.innerWidth - next.clientX);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", finish);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      dragRef.current = null;
      setDragging(false);
      storePanelWidth(widthRef.current);
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      finish();
    };

    dragRef.current = { pointerId, cleanup: finish };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", finish);
    setDragging(true);
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

  if (!visible) return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize assistant"
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={maxPanelWidth(window.innerWidth)}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => commit(PANEL_WIDTH_DEFAULT)}
      style={{ right: `var(${PANEL_WIDTH_VAR}, ${PANEL_WIDTH_DEFAULT}px)` }}
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
