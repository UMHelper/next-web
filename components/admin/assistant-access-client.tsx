"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSISTANT_ACCESS_MODES, type AssistantAccess } from "@/lib/assistant/access-mode";

type TesterRow = {
  email: string;
  added_by: string;
  added_by_email: string | null;
  created_at: string;
};

const MODE_COPY: Record<AssistantAccess, { label: string; description: string }> = {
  off: { label: "Off", description: "Hidden for everyone. The assistant API returns 403." },
  testers: { label: "Admins & testers", description: "Admins and the tester emails below." },
  everyone: { label: "Everyone", description: "Every signed-in user." },
};

const EVERYONE_CONFIRM =
  "All signed-in users will be able to use the assistant and incur DeepSeek cost. Continue?";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export default function AssistantAccessClient({ initialAccess }: { initialAccess: AssistantAccess }) {
  const [access, setAccess] = useState<AssistantAccess>(initialAccess);
  const [saving, setSaving] = useState(false);
  const [testers, setTesters] = useState<TesterRow[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(true);
  const [email, setEmail] = useState("");

  const loadTesters = useCallback(async () => {
    setLoadingTesters(true);
    try {
      const response = await fetch("/api/admin/assistant-testers", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response, "Failed to load testers"));
      const body = await response.json();
      setTesters(body.testers ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load testers");
    } finally {
      setLoadingTesters(false);
    }
  }, []);

  useEffect(() => {
    void loadTesters();
  }, [loadTesters]);

  async function changeAccess(next: AssistantAccess) {
    if (next === access || saving) return;
    if (next === "everyone" && !window.confirm(EVERYONE_CONFIRM)) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/app-config", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ai_assistant_access: next }),
      });
      if (!response.ok) {
        toast.error(await errorMessage(response, "Failed to update access"));
        return;
      }
      setAccess(next);
      toast.success(`AI assistant access: ${MODE_COPY[next].label}`);
    } catch {
      toast.error("Failed to update access");
    } finally {
      setSaving(false);
    }
  }

  async function addTester() {
    const value = email.trim();
    if (!value) return;
    const response = await fetch("/api/admin/assistant-testers", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: value }),
    });
    if (!response.ok) {
      toast.error(await errorMessage(response, "Failed to add tester"));
      return;
    }
    toast.success("Tester added");
    setEmail("");
    await loadTesters();
  }

  async function removeTester(target: string) {
    const response = await fetch(`/api/admin/assistant-testers/${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error(await errorMessage(response, "Failed to remove tester"));
      return;
    }
    toast.success("Tester removed");
    await loadTesters();
  }

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold">AI Assistant</div>

      <div className="rounded-lg border p-4">
        <div className="mb-1 text-sm font-medium">Access</div>
        <div className="mb-3 text-xs text-muted-foreground">
          Changes apply on the next request (at most 5 minutes if the cache is slow to clear).
        </div>
        <div role="radiogroup" aria-label="AI assistant access" className="grid gap-2 sm:grid-cols-3">
          {ASSISTANT_ACCESS_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={access === mode}
              disabled={saving}
              onClick={() => void changeAccess(mode)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50 ${
                access === mode ? "border-brand bg-brand/10" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{MODE_COPY[mode].label}</div>
              <div className="text-xs text-muted-foreground">{MODE_COPY[mode].description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-1 text-sm font-medium">Testers</div>
        <div className="mb-3 text-xs text-muted-foreground">
          Used only in &quot;Admins &amp; testers&quot; mode. Admins (see{" "}
          <Link href="/admin/admins" className="underline">
            Admins
          </Link>
          ) always have access. Matched against the user&apos;s verified email, so you can add people before
          they sign up.
        </div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Tester email"
            className="w-full sm:max-w-sm"
            placeholder="name@um.edu.mo"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addTester();
            }}
          />
          <Button className="w-full sm:w-auto" onClick={() => void addTester()} disabled={!email.trim()}>
            Add tester
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2">Email</th>
                <th className="py-2">Added by</th>
                <th className="py-2">Added</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingTesters && testers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {testers.map((tester) => (
                <tr key={tester.email} className="border-b last:border-0">
                  <td className="py-2 text-xs">{tester.email}</td>
                  <td className="py-2 text-xs">{tester.added_by_email ?? "-"}</td>
                  <td className="py-2 text-xs">{String(tester.created_at).slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2">
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label={`Remove ${tester.email}`}
                      onClick={() => void removeTester(tester.email)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {!loadingTesters && testers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No testers
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
