"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ASSISTANT_LIMIT_INTEGER_MAX,
  type AssistantLimitField,
  type AssistantLimitKey,
} from "@/lib/assistant/limits";

export type AssistantLimitView = {
  column: AssistantLimitField["column"];
  key: AssistantLimitKey;
  label: string;
  unit: AssistantLimitField["unit"];
  min: number;
  defaultValue: number;
  configuredValue: number | null;
};

export type AssistantSettingsInitial = {
  configured: boolean;
  effective: Record<AssistantLimitKey, number>;
  bounds: AssistantLimitView[];
};

const JSON_HEADERS = { "Content-Type": "application/json" };

const UNIT_SUFFIX: Record<AssistantLimitField["unit"], string> = {
  requests: "requests",
  turns: "turns",
  steps: "steps",
  tokens: "tokens",
  milliseconds: "ms",
};

const emptyFlags = (bounds: AssistantLimitView[]) =>
  Object.fromEntries(bounds.map((bound) => [bound.key, false])) as Record<AssistantLimitKey, boolean>;

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

const initialValues = (
  bounds: AssistantLimitView[],
  effective: Record<AssistantLimitKey, number>,
) =>
  Object.fromEntries(
    bounds.map((bound) => [
      bound.key,
      bound.configuredValue == null ? String(effective[bound.key]) : String(bound.configuredValue),
    ]),
  ) as Record<AssistantLimitKey, string>;

const initialInherits = (bounds: AssistantLimitView[]) =>
  Object.fromEntries(bounds.map((bound) => [bound.key, bound.configuredValue == null])) as Record<
    AssistantLimitKey,
    boolean
  >;

const initialStoredOverrides = (bounds: AssistantLimitView[]) =>
  Object.fromEntries(bounds.map((bound) => [bound.key, bound.configuredValue])) as Record<
    AssistantLimitKey,
    number | null
  >;

function buildOverridePatch(
  bounds: AssistantLimitView[],
  values: Record<AssistantLimitKey, string>,
  storedOverrides: Record<AssistantLimitKey, number | null>,
): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const bound of bounds) {
    const parsed = Number(values[bound.key].trim());
    const stored = storedOverrides[bound.key];
    if (stored === parsed) continue;
    patch[bound.column] = parsed;
  }
  return patch;
}

export default function AssistantSettingsClient({
  initial,
  canEdit,
}: {
  initial: AssistantSettingsInitial;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(initial.bounds, initial.effective));
  const [inherits, setInherits] = useState(() => initialInherits(initial.bounds));
  const [storedOverrides, setStoredOverrides] = useState(() => initialStoredOverrides(initial.bounds));
  const [dirty, setDirty] = useState(() => emptyFlags(initial.bounds));
  const [effective, setEffective] = useState(initial.effective);
  const [saving, setSaving] = useState(false);
  const [resettingKey, setResettingKey] = useState<AssistantLimitKey | null>(null);

  const hasPendingChanges = useMemo(
    () =>
      initial.bounds.some((bound) => {
        if (!dirty[bound.key]) return false;
        const parsed = Number(values[bound.key].trim());
        return parsed !== storedOverrides[bound.key];
      }),
    [initial.bounds, dirty, storedOverrides, values],
  );

  if (!canEdit) {
    return (
      <div className="rounded-lg border p-4">
        <div className="text-sm font-medium">Limits</div>
      </div>
    );
  }

  async function save() {
    if (saving) return;

    if (!hasPendingChanges) {
      toast.error("No changes to save");
      return;
    }

    for (const bound of initial.bounds) {
      if (!dirty[bound.key]) continue;
      const raw = values[bound.key].trim();
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < bound.min || parsed > ASSISTANT_LIMIT_INTEGER_MAX) {
        toast.error(
          `${bound.label} must be a whole number from ${bound.min} to ${ASSISTANT_LIMIT_INTEGER_MAX.toLocaleString()}.`,
        );
        return;
      }
    }

    const patch = buildOverridePatch(initial.bounds, values, storedOverrides);
    if (Object.keys(patch).length === 0) {
      toast.error("No changes to save");
      setDirty(emptyFlags(initial.bounds));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/app-config", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        toast.error(await errorMessage(response, "Failed to update limits"));
        return;
      }

      const nextOverrides = { ...storedOverrides };
      const nextInherits = { ...inherits };
      const nextEffective = { ...effective };

      for (const bound of initial.bounds) {
        const column = bound.column;
        if (!(column in patch)) continue;
        const value = patch[column];
        nextOverrides[bound.key] = value;
        nextInherits[bound.key] = false;
        nextEffective[bound.key] = value;
      }

      setStoredOverrides(nextOverrides);
      setInherits(nextInherits);
      setEffective(nextEffective);
      setDirty(emptyFlags(initial.bounds));
      toast.success("Assistant limits saved");
      router.refresh();
    } catch {
      toast.error("Failed to update limits");
    } finally {
      setSaving(false);
    }
  }

  async function resetField(bound: AssistantLimitView) {
    if (saving || resettingKey) return;
    if (storedOverrides[bound.key] === null && inherits[bound.key]) return;

    const clearingOverride = storedOverrides[bound.key] !== null;
    if (clearingOverride) {
      const ok = window.confirm(
        `${bound.label} will inherit the environment default (${bound.defaultValue}). Continue?`,
      );
      if (!ok) return;
    }

    setResettingKey(bound.key);
    try {
      const response = await fetch("/api/admin/app-config", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ [bound.column]: null }),
      });
      if (!response.ok) {
        toast.error(await errorMessage(response, "Failed to reset limit"));
        return;
      }

      setStoredOverrides((current) => ({ ...current, [bound.key]: null }));
      setInherits((current) => ({ ...current, [bound.key]: true }));
      setValues((current) => ({ ...current, [bound.key]: String(bound.defaultValue) }));
      setEffective((current) => ({ ...current, [bound.key]: bound.defaultValue }));
      setDirty((current) => ({ ...current, [bound.key]: false }));
      toast.success(`${bound.label} reset to environment default`);
      router.refresh();
    } catch {
      toast.error("Failed to reset limit");
    } finally {
      setResettingKey(null);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 text-sm font-medium">Limits</div>

      <div className="grid gap-3 sm:grid-cols-2">
        {initial.bounds.map((bound) => {
          const inputId = `assistant-limit-${bound.key}`;
          const usingDefault = inherits[bound.key];
          const canReset =
            storedOverrides[bound.key] !== null || dirty[bound.key] || !usingDefault;
          return (
            <div key={bound.key} className="space-y-1">
              <label htmlFor={inputId} className="text-xs font-medium">
                {bound.label}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={bound.min}
                  value={values[bound.key]}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [bound.key]: event.target.value }));
                    setInherits((current) => ({ ...current, [bound.key]: false }));
                    setDirty((current) => ({ ...current, [bound.key]: true }));
                  }}
                />
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {UNIT_SUFFIX[bound.unit]}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  disabled={!canReset || saving || resettingKey === bound.key}
                  onClick={() => void resetField(bound)}
                >
                  {resettingKey === bound.key ? "Resetting…" : "Reset"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || resettingKey !== null || !hasPendingChanges}
        >
          {saving ? "Saving…" : "Save limits"}
        </Button>
      </div>
    </div>
  );
}
