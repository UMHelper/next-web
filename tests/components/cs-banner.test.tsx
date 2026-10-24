import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import CsBanner from "@/components/cs-banner";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function bannerFor(pathname: string) {
  usePathnameMock.mockReturnValue(pathname);
  render(<CsBanner />);
  await waitFor(() => expect(usePathnameMock).toHaveBeenCalled());
  return screen.queryByText(/加入UMHelper Dev Group/);
}

describe("CsBanner", () => {
  it.each([
    "/course/CISC1001",
    "/course/CSCI1001",
    "/reviews/CSCI1001/XU%20QIWEN",
    "/catalog/FST/CIS",
    "/catalog/FIC/CSC",
  ])("shows on CS pages: %s", async (pathname) => {
    expect(await bannerFor(pathname)).not.toBeNull();
  });

  it.each([
    "/course/ACCT1000",
    "/catalog/FSC/CHM",
  ])("stays hidden on non-CS pages: %s", async (pathname) => {
    expect(await bannerFor(pathname)).toBeNull();
  });
});
