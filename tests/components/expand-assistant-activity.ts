import { fireEvent, screen } from "@testing-library/react";

export function expandAssistantActivity() {
  const button = screen.queryByRole("button", { name: "Show activity details" });
  if (button) fireEvent.click(button);
}
