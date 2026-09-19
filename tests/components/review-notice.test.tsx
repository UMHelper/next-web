import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError },
  useSonner: () => ({ toasts: [] }),
}));

import { ReviewNotice } from "@/components/review-notice";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewNotice", () => {
  it("shows once per mount for the same note", () => {
    const view = render(
      React.createElement(ReviewNotice, { admin_note: "hello", admin_note_en: "hello" }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);

    view.rerender(
      React.createElement(ReviewNotice, { admin_note: "hello", admin_note_en: "hello" }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("shows again when the note changes", () => {
    const view = render(
      React.createElement(ReviewNotice, { admin_note: "first", admin_note_en: "first" }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);

    view.rerender(
      React.createElement(ReviewNotice, { admin_note: "second", admin_note_en: "second" }),
    );

    expect(toastError).toHaveBeenCalledTimes(2);
  });
});
