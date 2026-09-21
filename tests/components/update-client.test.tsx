import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import UpdateClient from "@/app/admin/update/update-client";

afterEach(cleanup);

describe("UpdateClient", () => {
  it("disables the run button and explains why before a workbook is parsed", () => {
    const view = render(<UpdateClient />);

    const button = view.getByRole("button", { name: "请先上传 Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(view.getByText(/尚未解析/)).toBeTruthy();
    expect(view.getByText(/尚无日志/)).toBeTruthy();
  });
});
