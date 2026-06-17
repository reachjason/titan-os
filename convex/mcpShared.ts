export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SERVER_NAME = "titan-os";
export const MCP_SERVER_VERSION = "0.1.0";
export const MCP_ENDPOINT = "https://www.usetitan.xyz/mcp";
export const MCP_DEV_ENDPOINT = "https://abundant-jaguar-978.convex.site/mcp";
export const DEFAULT_TASK_TAGS = ["do", "todo"];

export const MCP_READS_PER_MINUTE = 120;
export const MCP_WRITES_PER_MINUTE = 30;
export const MCP_RATE_WINDOW_MS = 60_000;

export function normalizeTaskTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().replace(/^\//, "");
    if (/^[a-z0-9][a-z0-9_-]*$/.test(normalized) && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_TASK_TAGS];
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateMcpSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `titan_mcp_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
