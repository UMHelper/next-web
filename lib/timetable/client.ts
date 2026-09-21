import type { TimetablePlanPayload } from "@/lib/timetable/schema";

export type ServerPlan = {
  id: number;
  client_ref: string;
  owner_clerk_id: string;
  name: string;
  year: number;
  sem: number;
  payload: TimetablePlanPayload;
  schema_version: number;
  revision: number;
  share_token: string | null;
  share_token_created_at: string | null;
  created_at: string;
  updated_at: string;
};

export class TimetableApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Timetable API error ${status}`);
    this.name = "TimetableApiError";
  }
}

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(response);
  if (!response.ok) throw new TimetableApiError(response.status, body);
  return body as T;
};

export const listPlans = async (params: {
  year: number;
  sem?: number;
}): Promise<ServerPlan[]> => {
  const search = new URLSearchParams({ year: String(params.year) });
  if (params.sem !== undefined) search.set("sem", String(params.sem));
  const body = await request<{ plans: ServerPlan[] }>(
    `/api/timetable/plans?${search.toString()}`,
  );
  return body.plans;
};

export const createPlan = async (body: {
  clientRef: string;
  name: string;
  year: number;
  sem: number;
  payload: TimetablePlanPayload;
}): Promise<ServerPlan> => {
  const response = await request<{ plan: ServerPlan }>("/api/timetable/plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.plan;
};

export const updatePlan = async (
  id: number,
  body: {
    baseRevision: number;
    name?: string;
    payload?: TimetablePlanPayload;
  },
): Promise<ServerPlan> => {
  const response = await request<{ plan: ServerPlan }>(
    `/api/timetable/plans/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
  return response.plan;
};

export const deletePlan = async (id: number): Promise<void> => {
  await request<{ ok: true }>(`/api/timetable/plans/${id}`, {
    method: "DELETE",
  });
};
