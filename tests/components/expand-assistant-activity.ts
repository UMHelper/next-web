import { fireEvent, screen } from "@testing-library/react";

export function expandAssistantActivity() {
  const legacy = screen.queryByRole("button", { name: "Show activity details" });
  if (legacy?.getAttribute("aria-expanded") === "false") {
    fireEvent.click(legacy);
    return;
  }
  const traces = screen.queryAllByRole("button", { name: /Show \d+ tool steps?/i });
  const collapsed = traces.filter((button) => button.getAttribute("aria-expanded") === "false");
  const target = collapsed.at(-1);
  if (target) fireEvent.click(target);
}
