import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useUser }));

import { ReportDialog } from "@/components/report-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDialog", () => {
  it("does not render for anonymous users", () => {
    useUser.mockReturnValue({ isSignedIn: false });
    const view = render(React.createElement(ReportDialog, { targetId: 1 }));
    expect(view.queryByLabelText("Report comment")).toBeNull();
  });

  it("renders a report trigger for signed-in users", () => {
    useUser.mockReturnValue({ isSignedIn: true });
    const view = render(React.createElement(ReportDialog, { targetId: 1 }));
    expect(view.getByLabelText("Report comment")).toBeTruthy();
  });
});
