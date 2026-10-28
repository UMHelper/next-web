"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssistantLimitField, AssistantLimitKey } from "@/lib/assistant/limits";

export type AssistantLimitView = {
  column: AssistantLimitField["column"];
  key: AssistantLimitKey;
  label: string;
  unit: AssistantLimitField["unit"];
  min: number;
  max: number;
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

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

const initialValues = (bounds: AssistantLimitView[]) =>
  Object.fromEntries(
    bounds.map((bound) => [bound.key, bound.configuredValue == null ? "" : String(bound.configuredValue)]),
  ) as Record<AssistantLimitKey, string>;

export default function AssistantSettingsClient({
  initial,
  canEdit,
}: {
  initial: AssistantSettingsInitial;
  canEdit: boolean;
}) {
  const [values, setValues] = useState(() => initialValues(initial.bounds));
  const [effective, setEffective] = useState(initial.effective);
  const [saving, setSaving] = useState(false);

  if (!canEdit) {
    return (
      <div className="rounded-lg border p-4">
        <div className="mb-1 text-sm font-medium">Limits</div>
        <p className="text-xs text-muted-foreground">
          Only a platform admin can change assistant quotas and execution limits.
        </p>
      </div>
    );
  }

  async function save() {
    for (const bound of initial.bounds) {
      const raw = values[bound.key].trim();
      if (raw === "") continue;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < bound.min || parsed > bound.max) {
        toast.error(`${bound.label} must be a whole number between ${bound.min} and ${bound.max}.`);
        return;
      }
    }

    const patch = Object.fromEntries(
      initial.bounds.map((bound) => [
        bound.column,
        values[bound.key].trim() === "" ? null : Number(values[bound.key]),
      ]),
    );

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
      setEffective(
        Object.fromEntries(
          initial.bounds.map((bound) => [
            bound.key,
            values[bound.key].trim() === "" ? bound.defaultValue : Number(values[bound.key]),
          ]),
        ) as Record<AssistantLimitKey, number>,
      );
      toast.success("Assistant limits saved");
    } catch {
      toast.error("Failed to update limits");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-1 text-sm font-medium">Limits</div>
      <div className="mb-3 text-xs text-muted-foreground">
        Leave a field empty to inherit the environment default. Values are enforced on the server and
        cannot exceed the hard ceilings shown here.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {initial.bounds.map((bound) => {
          const inputId = `assistant-limit-${bound.key}`;
          const configured = values[bound.key].trim() !== "";
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
                  max={bound.max}
                  value={values[bound.key]}
                  placeholder={`Inherited (default ${bound.defaultValue})`}
                  aria-describedby={`${inputId}-hint`}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [bound.key]: event.target.value }))
                  }
                />
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {UNIT_SUFFIX[bound.unit]}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  disabled={!configured}
                  onClick={() => setValues((current) => ({ ...current, [bound.key]: "" }))}
                >
                  Inherit
                </Button>
              </div>
              <div id={`${inputId}-hint`} className="text-[11px] text-muted-foreground">
                Allowed {bound.min}–{bound.max}
                {configured
                  ? ` · Effective ${effective[bound.key]}`
                  : ` · Inherited (default ${bound.defaultValue})`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save limits"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Changes apply to new requests after the config cache refreshes (at most 5 minutes).
        </span>
      </div>
    </div>
  );
}
