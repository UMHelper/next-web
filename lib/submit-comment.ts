export type SubmitCommentResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

type SubmitCommentInput = {
  url: string;
  formData: FormData;
  fetchImpl?: typeof fetch;
};

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json();
    const message = body?.error?.message ?? body?.message;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // ignore non-JSON error bodies
  }

  return `HTTP ${response.status}`;
}

export async function submitComment({
  url,
  formData,
  fetchImpl = fetch,
}: SubmitCommentInput): Promise<SubmitCommentResult> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await readErrorMessage(response),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}
