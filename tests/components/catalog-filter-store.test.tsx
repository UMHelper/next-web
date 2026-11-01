import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CatalogFilterProvider,
  useCatalogFilter,
  useCatalogFilterStore,
} from "@/components/assistant/catalog-filter-store";

function FilterConsumer({ id }: { id: string }) {
  const [filter, setFilter] = useCatalogFilter(id);
  return (
    <div>
      <span data-testid={`value-${id}`}>{filter}</span>
      <button type="button" onClick={() => setFilter("offered")}>
        set-offered-{id}
      </button>
    </div>
  );
}

function ResetControl() {
  const store = useCatalogFilterStore();
  return (
    <button type="button" onClick={() => store?.reset()}>
      reset-filters
    </button>
  );
}

afterEach(() => {
  cleanup();
});

describe("catalog filter store", () => {
  it("keeps filters per result set and resets them", () => {
    render(
      <CatalogFilterProvider>
        <FilterConsumer id="a" />
        <FilterConsumer id="b" />
        <ResetControl />
      </CatalogFilterProvider>,
    );

    expect(screen.getByTestId("value-a").textContent).toBe("all");
    expect(screen.getByTestId("value-b").textContent).toBe("all");

    fireEvent.click(screen.getByRole("button", { name: "set-offered-a" }));

    expect(screen.getByTestId("value-a").textContent).toBe("offered");
    expect(screen.getByTestId("value-b").textContent).toBe("all");

    fireEvent.click(screen.getByRole("button", { name: "reset-filters" }));

    expect(screen.getByTestId("value-a").textContent).toBe("all");
    expect(screen.getByTestId("value-b").textContent).toBe("all");
  });

  it("falls back to local state without a provider", () => {
    render(<FilterConsumer id="local-only" />);

    expect(screen.getByTestId("value-local-only").textContent).toBe("all");
    fireEvent.click(screen.getByRole("button", { name: "set-offered-local-only" }));
    expect(screen.getByTestId("value-local-only").textContent).toBe("offered");
  });
});
