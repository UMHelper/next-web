import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CommentContent } from "@/components/comment-content";

afterEach(cleanup);

describe("CommentContent", () => {
  it("renders plain comment content", () => {
    const view = render(React.createElement(CommentContent, { content: "hello comment" }));
    expect(view.container.textContent).toBe("hello comment");
  });

  it("wraps the redaction marker in a pill", () => {
    const view = render(
      React.createElement(CommentContent, {
        content: "hello [REDACTED by UMHelper] world",
      }),
    );

    expect(view.container.textContent).toContain("hello ");
    expect(view.getByText("REDACTED")).toBeTruthy();
    expect(view.container.textContent).toContain(" world");
  });
});
