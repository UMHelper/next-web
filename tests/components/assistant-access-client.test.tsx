import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement("a", { href, ...props }, children as React.ReactNode),
  };
});

import AssistantAccessClient from "@/components/admin/assistant-access-client";

type Reply = { ok: boolean; body: unknown };
type Router = (url: string, init?: RequestInit) => Reply;

const tester = {
  email: "tester@um.edu.mo",
  added_by: "user_admin",
  added_by_email: "admin@um.edu.mo",
  created_at: "2026-10-18T08:00:00Z",
};
const list = (testers: unknown[]): Reply => ({ ok: true, body: { testers } });

function stubFetch(router: Router) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = router(url, init);
    return { ok: reply.ok, status: reply.ok ? 200 : 400, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const modeRadio = (name: RegExp) => screen.getByRole("radio", { name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AssistantAccessClient", () => {
  it("shows the current mode and the tester list", async () => {
    stubFetch(() => list([tester]));
    render(<AssistantAccessClient initialAccess="testers" />);

    expect(modeRadio(/Admins & testers/).getAttribute("aria-checked")).toBe("true");
    expect(modeRadio(/Off/).getAttribute("aria-checked")).toBe("false");
    expect(await screen.findByText("tester@um.edu.mo")).toBeTruthy();
    expect(screen.getByText("admin@um.edu.mo")).toBeTruthy();
  });

  it("saves a mode change through the app-config route", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: true, body: { config: {} } } : list([]),
    );
    render(<AssistantAccessClient initialAccess="off" />);

    fireEvent.click(modeRadio(/Admins & testers/));

    await waitFor(() => expect(modeRadio(/Admins & testers/).getAttribute("aria-checked")).toBe("true"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/admin/app-config");
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ai_assistant_access: "testers" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("asks for confirmation before opening to everyone and does nothing if cancelled", async () => {
    const fetchMock = stubFetch(() => list([]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(modeRadio(/Everyone/));

    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/admin/app-config")).toBe(false);
    expect(modeRadio(/Everyone/).getAttribute("aria-checked")).toBe("false");
  });

  it("opens to everyone after confirmation", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: true, body: { config: {} } } : list([]),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(modeRadio(/Everyone/));

    await waitFor(() => expect(modeRadio(/Everyone/).getAttribute("aria-checked")).toBe("true"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/admin/app-config");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ai_assistant_access: "everyone" });
  });

  it("keeps the old mode and shows the error when saving fails", async () => {
    stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: false, body: { error: { message: "boom" } } } : list([]),
    );
    render(<AssistantAccessClient initialAccess="off" />);

    fireEvent.click(modeRadio(/Admins & testers/));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    expect(modeRadio(/Off/).getAttribute("aria-checked")).toBe("true");
  });

  it("adds a tester and reloads the list", async () => {
    let added = false;
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        added = true;
        return { ok: true, body: { ok: true, email: "new@um.edu.mo" } };
      }
      return list(added ? [{ ...tester, email: "new@um.edu.mo" }] : []);
    });
    render(<AssistantAccessClient initialAccess="testers" />);
    await screen.findByText("No testers");

    fireEvent.change(screen.getByLabelText("Tester email"), { target: { value: "new@um.edu.mo" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));

    expect(await screen.findByText("new@um.edu.mo")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(call?.[0]).toBe("/api/admin/assistant-testers");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: "new@um.edu.mo" });
    expect(toast.success).toHaveBeenCalledWith("Tester added");
  });

  it("removes a tester through the encoded URL", async () => {
    let removed = false;
    const fetchMock = stubFetch((_url, init) => {
      if (init?.method === "DELETE") {
        removed = true;
        return { ok: true, body: { ok: true } };
      }
      return list(removed ? [] : [tester]);
    });
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove tester@um.edu.mo" }));

    expect(await screen.findByText("No testers")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(call?.[0]).toBe("/api/admin/assistant-testers/tester%40um.edu.mo");
    expect(toast.success).toHaveBeenCalledWith("Tester removed");
  });
});
