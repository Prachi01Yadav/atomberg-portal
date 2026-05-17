import type { AxiosError } from "axios";

/** Turns FastAPI `detail` (string or structured) into human-readable lines. */
export function formatApiError(err: unknown): string {
  const ax = err as AxiosError<{ detail?: unknown }>;
  const detail = ax.response?.data?.detail;
  if (detail == null) {
    return ax.message || "Request failed";
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === "string" && Array.isArray(o.errors)) {
      const parts = [o.message];
      for (const e of o.errors as { field?: string; message?: string }[]) {
        if (e?.field && e?.message) parts.push(`${e.field}: ${e.message}`);
        else if (e?.message) parts.push(String(e.message));
      }
      return parts.join("\n");
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}
