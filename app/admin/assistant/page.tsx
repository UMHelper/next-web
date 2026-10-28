import React from "react";
import { notFound, redirect } from "next/navigation";

import AssistantAccessClient from "@/components/admin/assistant-access-client";
import AssistantSettingsClient, {
  type AssistantLimitView,
  type AssistantSettingsInitial,
} from "@/components/admin/assistant-settings-client";
import AssistantUsageClient from "@/components/admin/assistant-usage-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { readAssistantAccess } from "@/lib/assistant/access";
import { readAssistantConfig } from "@/lib/assistant/config";
import {
  ASSISTANT_LIMIT_BOUNDS,
  ASSISTANT_LIMIT_FIELDS,
  type AssistantLimitKey,
} from "@/lib/assistant/limits";
import { readAssistantLimitOverrides, resolveAssistantConfig } from "@/lib/assistant/settings";
import { readAssistantUsageSummary } from "@/lib/assistant/usage";

export const dynamic = "force-dynamic";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

export default async function AssistantAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }

  const [access, overrides, effective, usage] = await Promise.all([
    readAssistantAccess(),
    readAssistantLimitOverrides(),
    resolveAssistantConfig(),
    readAssistantUsageSummary(),
  ]);

  const base = readAssistantConfig();
  const bounds: AssistantLimitView[] = ASSISTANT_LIMIT_FIELDS.map((field) => {
    const { min, max } = ASSISTANT_LIMIT_BOUNDS[field.key];
    return {
      column: field.column,
      key: field.key,
      label: field.label,
      unit: field.unit,
      min,
      max,
      defaultValue: clamp(base[field.key], min, max),
      configuredValue: overrides[field.key] ?? null,
    };
  });
  const effectiveLimits = Object.fromEntries(
    ASSISTANT_LIMIT_FIELDS.map((field) => [field.key, effective[field.key]]),
  ) as Record<AssistantLimitKey, number>;
  const settings: AssistantSettingsInitial = {
    configured: bounds.some((bound) => bound.configuredValue !== null),
    effective: effectiveLimits,
    bounds,
  };

  return (
    <div className="space-y-6">
      <AssistantAccessClient initialAccess={access} />
      {admin.session.isPlatformAdmin ? (
        <AssistantSettingsClient initial={settings} canEdit />
      ) : null}
      <AssistantUsageClient initial={usage} />
    </div>
  );
}
