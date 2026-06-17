import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  sha256Hex,
} from "./mcpShared";

type JsonObject = Record<string, unknown>;
type RequestId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: RequestId;
  method?: string;
  params?: unknown;
}

interface AuthContext {
  userId: Id<"users">;
  keyId: Id<"mcpKeys">;
}

type ToolResult = JsonObject & {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: JsonObject;
  isError: boolean;
};

interface ResourceEntry {
  id: string;
  raw: string;
  body: string;
  bodyPreview?: string;
  tags: string[];
  createdAtIso: string;
  authorName: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  vary: "origin",
};

const ALLOWED_ORIGINS = new Set([
  "https://www.usetitan.xyz",
  "https://usetitan.xyz",
  "https://robust-grasshopper-674.convex.site",
  "https://abundant-jaguar-978.convex.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR = -32603;

const WRITE_TOOLS = new Set([
  "titan_entry_create",
  "titan_entry_update_text",
  "titan_entry_set_state",
]);

const tools = [
  {
    name: "titan_profile_get",
    description:
      "Get the Titan OS profile, task-tag settings, and entry counts for the authenticated MCP key owner.",
    inputSchema: objectSchema({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_entries_search",
    description:
      "Search visible Titan OS entries. Visible entries include entries authored by the key owner and collaboration entries where the owner is mentioned.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Case-insensitive text search across raw text, body, tags, author, and mentions." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags to filter by, without the leading slash.",
      },
      tagMatch: { enum: ["any", "all"], description: "How multiple tags combine. Default: any." },
      status: { enum: ["todo", "doing", "done"], description: "Kanban status filter." },
      done: { type: "boolean", description: "Completion filter. /done also counts as done." },
      pinned: { type: "boolean", description: "Pinned/starred filter." },
      scope: { enum: ["all", "owned", "shared"], description: "Ownership scope. Default: all." },
      author: { type: "string", description: "Author id, name, or first-name fragment." },
      mention: { type: "string", description: "Mentioned user id, name, or first-name fragment." },
      createdAfter: { type: ["number", "string"], description: "Unix milliseconds or ISO date lower bound." },
      createdBefore: { type: ["number", "string"], description: "Unix milliseconds or ISO date upper bound." },
      updatedAfter: { type: ["number", "string"], description: "Unix milliseconds or ISO date lower bound." },
      updatedBefore: { type: ["number", "string"], description: "Unix milliseconds or ISO date upper bound." },
      sort: {
        enum: ["created_desc", "created_asc", "updated_desc", "updated_asc", "manual"],
        description: "Sort order. Default: created_desc.",
      },
      limit: { type: "number", minimum: 1, maximum: 100, description: "Page size. Default: 50, max: 100." },
      cursor: { type: "string", description: "Pagination cursor returned by a previous call." },
      detail: { enum: ["summary", "full"], description: "Return shape. Default: full." },
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_entry_get",
    description: "Fetch one visible Titan OS entry by exact entry id.",
    inputSchema: objectSchema({
      id: { type: "string", description: "Titan entry id." },
    }, ["id"]),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_tags_list",
    description: "List visible Titan OS tags with counts and recent usage timestamps.",
    inputSchema: objectSchema({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_collaborators_list",
    description:
      "List collaborators visible through authored/shared entries. Returns names and ids only, not collaborator emails or images.",
    inputSchema: objectSchema({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_entry_create",
    description:
      "Create a new Titan OS entry from raw text. /tags and @mentions are parsed the same way as the app.",
    inputSchema: objectSchema({
      raw: { type: "string", minLength: 1, description: "Raw entry text, including any /tags or @mentions." },
    }, ["raw"]),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "titan_entry_update_text",
    description:
      "Replace an existing visible entry's raw text. Tags and mentions are reparsed; this does not delete entries.",
    inputSchema: objectSchema({
      id: { type: "string", description: "Titan entry id." },
      raw: { type: "string", minLength: 1, description: "Replacement raw entry text." },
    }, ["id", "raw"]),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "titan_entry_set_state",
    description:
      "Update an entry's status, done flag, pinned flag, or manual order. This tool cannot delete entries.",
    inputSchema: objectSchema({
      id: { type: "string", description: "Titan entry id." },
      status: { enum: ["todo", "doing", "done"], description: "Kanban status to set." },
      done: { type: "boolean", description: "Completion flag. Must not conflict with status." },
      pinned: { type: "boolean", description: "Whether the entry is pinned/starred." },
      order: { type: "number", description: "Manual sort/board order." },
    }, ["id"]),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
] satisfies JsonObject[];

export const options = httpAction(async (_ctx, request) => {
  const originProblem = validateOrigin(request);
  if (originProblem) return originProblem;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
});

export const get = httpAction(async (_ctx, request) => {
  const originProblem = validateOrigin(request);
  if (originProblem) return originProblem;
  return new Response("Titan OS MCP uses stateless Streamable HTTP over POST.", {
    status: 405,
    headers: {
      ...corsHeaders(request),
      "content-type": "text/plain; charset=utf-8",
      allow: "POST, OPTIONS",
    },
  });
});

export const post = httpAction(async (ctx, request) => {
  const originProblem = validateOrigin(request);
  if (originProblem) return originProblem;

  const url = new URL(request.url);
  if (
    url.searchParams.has("api-key") ||
    url.searchParams.has("api_key") ||
    url.searchParams.has("key") ||
    url.searchParams.has("token")
  ) {
    return json(
      rpcError(null, JSONRPC_INVALID_REQUEST, "Do not put MCP keys in query strings. Use Authorization: Bearer <key>."),
      400,
      request
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, JSONRPC_PARSE_ERROR, "Invalid JSON request body."), 400, request);
  }

  const requests = Array.isArray(body) ? body : [body];
  const parsed = requests.map(parseRpcRequest);
  const kind = parsed.some((item) => item.request && isWriteRpc(item.request)) ? "write" : "read";

  const bearer = bearerToken(request);
  if (!bearer) {
    return text("Missing Authorization: Bearer <Titan MCP key>.", 401, request);
  }

  const authAttempt = await ctx.runMutation(internal.mcp.authenticateAndRateLimit, {
    secretHash: await sha256Hex(bearer),
    kind,
  });

  if (!authAttempt.ok) {
    if (authAttempt.code === "rate_limited") {
      return json(
        rpcError(null, JSONRPC_INTERNAL_ERROR, "MCP rate limit exceeded.", {
          retryAfterSeconds: authAttempt.retryAfterSeconds ?? 60,
        }),
        429,
        request
      );
    }
    return text("Invalid or revoked Titan MCP key.", 401, request);
  }

  if (!authAttempt.userId || !authAttempt.keyId) {
    return text("Titan MCP authentication failed.", 401, request);
  }

  const auth: AuthContext = {
    userId: authAttempt.userId,
    keyId: authAttempt.keyId,
  };

  const responses = [];
  for (const item of parsed) {
    if (item.error) {
      responses.push(item.error);
      continue;
    }
    const response = await handleRpc(ctx, auth, item.request);
    if (response) responses.push(response);
  }

  if (Array.isArray(body)) {
    return responses.length > 0 ? json(responses, 200, request) : new Response(null, { status: 202, headers: corsHeaders(request) });
  }
  return responses[0] ? json(responses[0], 200, request) : new Response(null, { status: 202, headers: corsHeaders(request) });
});

function objectSchema(properties: JsonObject, required: string[] = []): JsonObject {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || ALLOWED_ORIGINS.has(origin)) return null;
  return text("Origin is not allowed for Titan OS MCP.", 403, request);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function json(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request),
  });
}

function text(message: string, status: number, request: Request): Response {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseRpcRequest(value: unknown):
  | { request: JsonRpcRequest; error?: never }
  | { request?: never; error: JsonObject } {
  if (!isRecord(value)) {
    return { error: rpcError(null, JSONRPC_INVALID_REQUEST, "JSON-RPC request must be an object.") };
  }
  const id = isRequestId(value.id) ? value.id : null;
  if (value.jsonrpc !== undefined && value.jsonrpc !== "2.0") {
    return { error: rpcError(id, JSONRPC_INVALID_REQUEST, "jsonrpc must be \"2.0\".") };
  }
  if (typeof value.method !== "string" || !value.method) {
    return { error: rpcError(id, JSONRPC_INVALID_REQUEST, "method is required.") };
  }
  return {
    request: {
      jsonrpc: "2.0",
      id,
      method: value.method,
      params: value.params,
    },
  };
}

function isRequestId(value: unknown): value is RequestId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWriteRpc(request: JsonRpcRequest): boolean {
  if (request.method !== "tools/call") return false;
  const params = isRecord(request.params) ? request.params : {};
  return typeof params.name === "string" && WRITE_TOOLS.has(params.name);
}

async function handleRpc(
  ctx: ActionCtx,
  auth: AuthContext,
  request: JsonRpcRequest
): Promise<JsonObject | null> {
  const id = request.id ?? null;
  try {
    if (request.method === "notifications/initialized") return null;
    if (request.method === "initialize") {
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
        },
        instructions:
          "Titan OS exposes the authenticated user's visible work log: owned entries plus collaboration entries where they are mentioned. Use search filters before requesting large context.",
      });
    }
    if (request.method === "ping") return rpcResult(id, {});
    if (request.method === "tools/list") return rpcResult(id, { tools });
    if (request.method === "tools/call") {
      const result = await callTool(ctx, auth, request.params);
      return rpcResult(id, result);
    }
    if (request.method === "resources/list") {
      const result = await listResources(ctx, auth, request.params);
      return rpcResult(id, result);
    }
    if (request.method === "resources/read") {
      const result = await readResource(ctx, auth, request.params);
      return rpcResult(id, result);
    }
    return rpcError(id, JSONRPC_METHOD_NOT_FOUND, `Unsupported MCP method: ${request.method}`);
  } catch (error) {
    return rpcError(id, JSONRPC_INTERNAL_ERROR, messageFromError(error));
  }
}

function rpcResult(id: RequestId, result: JsonObject): JsonObject {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: RequestId,
  code: number,
  message: string,
  data?: JsonObject
): JsonObject {
  return {
    jsonrpc: "2.0",
    id,
    error: data ? { code, message, data } : { code, message },
  };
}

function toolResult(data: JsonObject, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError,
  };
}

function toolError(message: string, details?: JsonObject): ToolResult {
  return toolResult({ error: { message, ...(details ?? {}) } }, true);
}

async function callTool(
  ctx: ActionCtx,
  auth: AuthContext,
  params: unknown
): Promise<ToolResult> {
  const p = assertRecord(params, "tools/call params must be an object.");
  const name = assertString(p.name, "Tool name is required.");
  const args = p.arguments === undefined ? {} : assertRecord(p.arguments, "Tool arguments must be an object.");

  try {
    if (name === "titan_profile_get") {
      return toolResult(await ctx.runQuery(internal.mcp.profileGet, { userId: auth.userId }));
    }
    if (name === "titan_entries_search") {
      return toolResult(
        await ctx.runQuery(internal.mcp.entriesSearch, {
          userId: auth.userId,
          filters: searchFilters(args),
        })
      );
    }
    if (name === "titan_entry_get") {
      const entry = await ctx.runQuery(internal.mcp.entryGet, {
        userId: auth.userId,
        id: assertString(args.id, "id is required."),
      });
      return entry ? toolResult({ entry }) : toolError("Entry not found.");
    }
    if (name === "titan_tags_list") {
      return toolResult(await ctx.runQuery(internal.mcp.tagsList, { userId: auth.userId }));
    }
    if (name === "titan_collaborators_list") {
      return toolResult(await ctx.runQuery(internal.mcp.collaboratorsList, { userId: auth.userId }));
    }
    if (name === "titan_entry_create") {
      return await auditedWrite(ctx, auth, name, async () => {
        const entry = await ctx.runMutation(internal.mcp.entryCreate, {
          userId: auth.userId,
          raw: assertString(args.raw, "raw is required."),
        });
        return toolResult({ entry });
      });
    }
    if (name === "titan_entry_update_text") {
      return await auditedWrite(ctx, auth, name, async () => {
        const entry = await ctx.runMutation(internal.mcp.entryUpdateText, {
          userId: auth.userId,
          id: assertString(args.id, "id is required."),
          raw: assertString(args.raw, "raw is required."),
        });
        return toolResult({ entry });
      });
    }
    if (name === "titan_entry_set_state") {
      return await auditedWrite(ctx, auth, name, async () => {
        const state = stateArgs(args);
        const entry = await ctx.runMutation(internal.mcp.entrySetState, {
          userId: auth.userId,
          ...state,
        });
        return toolResult({ entry });
      });
    }
    return toolError(`Unknown Titan OS tool: ${name}`);
  } catch (error) {
    return toolError(messageFromError(error));
  }
}

async function auditedWrite(
  ctx: ActionCtx,
  auth: AuthContext,
  toolName: string,
  run: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    const result = await run();
    await safeAudit(ctx, auth, toolName, result.structuredContent, true);
    return result;
  } catch (error) {
    await safeAudit(ctx, auth, toolName, {}, false, messageFromError(error));
    throw error;
  }
}

async function safeAudit(
  ctx: ActionCtx,
  auth: AuthContext,
  toolName: string,
  data: JsonObject,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await ctx.runMutation(internal.mcp.recordAudit, {
      userId: auth.userId,
      keyId: auth.keyId,
      toolName,
      entryId: entryIdFromData(data),
      success,
      error,
    });
  } catch (auditError) {
    console.warn("Failed to record MCP audit event", auditError);
  }
}

function entryIdFromData(data: JsonObject): Id<"entries"> | undefined {
  const entry = data.entry;
  if (isRecord(entry) && typeof entry.id === "string") {
    return entry.id as Id<"entries">;
  }
  return undefined;
}

async function listResources(ctx: ActionCtx, auth: AuthContext, params: unknown): Promise<JsonObject> {
  const p = params === undefined ? {} : assertRecord(params, "resources/list params must be an object.");
  const result = await ctx.runQuery(internal.mcp.entriesSearch, {
    userId: auth.userId,
    filters: {
      limit: numberParam(p.limit, 50),
      cursor: optionalString(p.cursor),
      detail: "summary" as const,
      sort: "created_desc" as const,
    },
  });
  return {
    resources: (result.entries as ResourceEntry[]).map((entry) => ({
      uri: `titan://entry/${entry.id}`,
      name: entryName(entry),
      description: `${entry.createdAtIso} by ${entry.authorName}${
        entry.tags.length ? ` /${entry.tags.join(" /")}` : ""
      }`,
      mimeType: "application/json",
    })),
    nextCursor: result.nextCursor,
  };
}

async function readResource(ctx: ActionCtx, auth: AuthContext, params: unknown): Promise<JsonObject> {
  const p = assertRecord(params, "resources/read params must be an object.");
  const uri = assertString(p.uri, "uri is required.");
  const prefix = "titan://entry/";
  if (!uri.startsWith(prefix)) {
    throw new McpParamError(`Unsupported resource URI: ${uri}`);
  }
  const entry = await ctx.runQuery(internal.mcp.entryGet, {
    userId: auth.userId,
    id: uri.slice(prefix.length),
  });
  if (!entry) {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: "Entry not found." }),
        },
      ],
    };
  }
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ entry }, null, 2),
      },
    ],
  };
}

function entryName(entry: {
  body: string;
  bodyPreview?: string;
  raw: string;
  tags: string[];
  createdAtIso: string;
}): string {
  const body = entry.bodyPreview || entry.body || entry.raw || "Untitled entry";
  const tag = entry.tags[0] ? `/${entry.tags[0]} ` : "";
  return `${entry.createdAtIso.slice(0, 10)} ${tag}${body.slice(0, 80)}`;
}

function searchFilters(args: Record<string, unknown>) {
  return {
    query: optionalString(args.query),
    tags: optionalStringArray(args.tags)?.map((tag) => tag.replace(/^\//, "").toLowerCase()),
    tagMatch: enumParam(args.tagMatch, ["any", "all"]),
    status: enumParam(args.status, ["todo", "doing", "done"]),
    done: optionalBoolean(args.done),
    pinned: optionalBoolean(args.pinned),
    scope: enumParam(args.scope, ["all", "owned", "shared"]),
    author: optionalString(args.author),
    mention: optionalString(args.mention),
    createdAfter: optionalDateMs(args.createdAfter),
    createdBefore: optionalDateMs(args.createdBefore),
    updatedAfter: optionalDateMs(args.updatedAfter),
    updatedBefore: optionalDateMs(args.updatedBefore),
    sort: enumParam(args.sort, ["created_desc", "created_asc", "updated_desc", "updated_asc", "manual"]),
    limit: optionalNumber(args.limit),
    cursor: optionalString(args.cursor),
    detail: enumParam(args.detail, ["summary", "full"]),
  };
}

function stateArgs(args: Record<string, unknown>) {
  const id = assertString(args.id, "id is required.");
  const status = enumParam(args.status, ["todo", "doing", "done"]);
  const done = optionalBoolean(args.done);
  const pinned = optionalBoolean(args.pinned);
  const order = optionalNumber(args.order);
  if (status === undefined && done === undefined && pinned === undefined && order === undefined) {
    throw new McpParamError("Provide at least one of status, done, pinned, or order.");
  }
  if (status && done !== undefined) {
    const statusDone = status === "done";
    if (statusDone !== done) {
      throw new McpParamError("status and done conflict. Use status=done with done=true, or a non-done status with done=false.");
    }
  }
  return { id, status, done, pinned, order };
}

function assertRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new McpParamError(message);
  return value;
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new McpParamError(message);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberParam(value: unknown, fallback: number): number {
  const number = optionalNumber(value);
  return number === undefined ? fallback : number;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) throw new McpParamError("Expected an array of strings.");
  return value.map((item) => assertString(item, "Expected an array of strings."));
}

function enumParam<const T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new McpParamError(`Expected one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function optionalDateMs(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new McpParamError("Expected a Unix millisecond timestamp or ISO date string.");
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected MCP server error.";
}

class McpParamError extends Error {}
