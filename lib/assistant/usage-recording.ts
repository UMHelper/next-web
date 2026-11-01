import { isRateLimitDisabled } from "@/lib/rate-limit";
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";

import type { AssistantUsageRecording } from "@/lib/assistant/usage-shared";

export function readAssistantUsageRecording(): AssistantUsageRecording {
  if (isReadonlyPreview()) return { status: "preview_readonly" };
  if (isRateLimitDisabled()) return { status: "dev_quota_bypass" };
  return { status: "live" };
}
