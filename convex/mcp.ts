import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  applyStatus,
  firstNameKey,
  parseEntry,
  parseMentionTokens,
  type TaskStatus,
} from "./lib";
import {
  DEFAULT_TASK_TAGS,
  MCP_DEV_ENDPOINT,
  MCP_ENDPOINT,
  MCP_RATE_WINDOW_MS,
  MCP_READS_PER_MINUTE,
  MCP_WRITES_PER_MINUTE,
  generateMcpSecret,
  iso,
  normalizeTaskTags,
  sha256Hex,
} from "./mcpShared";

const statusValidator = v.union(
  v.literal("todo"),
  v.literal("doing"),
  v.literal("done")
);

const rateLimitKindValidator = v.union(v.literal("read"), v.literal("write"));

const searchFiltersValidator = v.object({
  query: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  tagMatch: v.optional(v.union(v.literal("any"), v.literal("all"))),
  status: v.optional(statusValidator),
  done: v.optional(v.boolean()),
  pinned: v.optional(v.boolean()),
  scope: v.optional(v.union(v.literal("all"), v.literal("owned"), v.literal("shared"))),
  author: v.optional(v.string()),
  mention: v.optional(v.string()),
  createdAfter: v.optional(v.number()),
  createdBefore: v.optional(v.number()),
  updatedAfter: v.optional(v.number()),
  updatedBefore: v.optional(v.number()),
  sort: v.optional(
    v.union(
      v.literal("created_desc"),
      v.literal("created_asc"),
      v.literal("updated_desc"),
      v.literal("updated_asc"),
      v.literal("manual")
    )
  ),
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
  detail: v.optional(v.union(v.literal("summary"), v.literal("full"))),
});

interface PersonRef {
  id: string;
  name: string;
  firstName: string;
}

interface FormattedEntry {
  id: string;
  raw: string;
  body: string;
  bodyPreview?: string;
  tags: string[];
  createdAtMs: number;
  createdAtIso: string;
  updatedAtMs: number;
  updatedAtIso: string;
  edited: boolean;
  done: boolean;
  pinned: boolean;
  status: TaskStatus;
  order: number;
  authorId: string;
  authorName: string;
  isMine: boolean;
  mentions: PersonRef[];
}

interface PublicMcpKey {
  id: Id<"mcpKeys">;
  secret: string;
  createdAt: number;
  createdAtIso: string;
  lastUsedAt: number | undefined;
  lastUsedAtIso: string | null;
  revokedAt: number | undefined;
  revokedAtIso: string | null;
}

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function activeKeyForUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const keys = await ctx.db
    .query("mcpKeys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return keys
    .filter((key) => key.revokedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

async function settingsForUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    row: settings,
    taskTags: settings?.taskTags ?? [...DEFAULT_TASK_TAGS],
  };
}

async function upsertSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  taskTags: string[]
): Promise<void> {
  const normalized = normalizeTaskTags(taskTags);
  const now = Date.now();
  const existing = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { taskTags: normalized, updatedAt: now });
  } else {
    await ctx.db.insert("userSettings", {
      userId,
      taskTags: normalized,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function ensureSettings(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const existing = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) return;
  const now = Date.now();
  await ctx.db.insert("userSettings", {
    userId,
    taskTags: [...DEFAULT_TASK_TAGS],
    createdAt: now,
    updatedAt: now,
  });
}

function publicKeyShape(key: Doc<"mcpKeys"> | null): PublicMcpKey | null {
  if (!key) return null;
  return {
    id: key._id,
    secret: key.secret,
    createdAt: key.createdAt,
    createdAtIso: iso(key.createdAt),
    lastUsedAt: key.lastUsedAt,
    lastUsedAtIso: key.lastUsedAt ? iso(key.lastUsedAt) : null,
    revokedAt: key.revokedAt,
    revokedAtIso: key.revokedAt ? iso(key.revokedAt) : null,
  };
}

export const getAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const key = await activeKeyForUser(ctx, userId);
    const settings = await settingsForUser(ctx, userId);
    return {
      endpoint: MCP_ENDPOINT,
      devEndpoint: MCP_DEV_ENDPOINT,
      key: publicKeyShape(key),
      taskTags: settings.taskTags,
    };
  },
});

export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const settings = await settingsForUser(ctx, userId);
    return { taskTags: settings.taskTags };
  },
});

export const updateTaskTags = mutation({
  args: { taskTags: v.array(v.string()) },
  handler: async (ctx, { taskTags }) => {
    const userId = await requireUser(ctx);
    await upsertSettings(ctx, userId, taskTags);
    return { taskTags: normalizeTaskTags(taskTags) };
  },
});

export const ensureKey = action({
  args: {},
  handler: async (ctx): Promise<PublicMcpKey | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing: PublicMcpKey | null = await ctx.runQuery(internal.mcp.getActiveKey, {
      userId,
    });
    if (existing) return existing;

    const secret = generateMcpSecret();
    const secretHash = await sha256Hex(secret);
    return await ctx.runMutation(internal.mcp.createGeneratedKey, {
      userId,
      secret,
      secretHash,
    });
  },
});

export const rotateKey = action({
  args: {},
  handler: async (ctx): Promise<PublicMcpKey | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const secret = generateMcpSecret();
    const secretHash = await sha256Hex(secret);
    return await ctx.runMutation(internal.mcp.rotateGeneratedKey, {
      userId,
      secret,
      secretHash,
    });
  },
});

export const revokeKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const key = await activeKeyForUser(ctx, userId);
    if (!key) return { revoked: false };
    await ctx.db.patch(key._id, { revokedAt: Date.now() });
    return { revoked: true };
  },
});

export const getActiveKey = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return publicKeyShape(await activeKeyForUser(ctx, userId));
  },
});

export const createGeneratedKey = internalMutation({
  args: {
    userId: v.id("users"),
    secret: v.string(),
    secretHash: v.string(),
  },
  handler: async (ctx, { userId, secret, secretHash }) => {
    const existing = await activeKeyForUser(ctx, userId);
    if (existing) return publicKeyShape(existing);

    const now = Date.now();
    await ensureSettings(ctx, userId);
    const id = await ctx.db.insert("mcpKeys", {
      userId,
      secret,
      secretHash,
      createdAt: now,
    });
    return publicKeyShape((await ctx.db.get(id)) ?? null);
  },
});

export const rotateGeneratedKey = internalMutation({
  args: {
    userId: v.id("users"),
    secret: v.string(),
    secretHash: v.string(),
  },
  handler: async (ctx, { userId, secret, secretHash }) => {
    const now = Date.now();
    const keys = await ctx.db
      .query("mcpKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const key of keys) {
      if (key.revokedAt === undefined) {
        await ctx.db.patch(key._id, { revokedAt: now });
      }
    }
    await ensureSettings(ctx, userId);
    const id = await ctx.db.insert("mcpKeys", {
      userId,
      secret,
      secretHash,
      createdAt: now,
    });
    return publicKeyShape((await ctx.db.get(id)) ?? null);
  },
});

export const authenticateAndRateLimit = internalMutation({
  args: {
    secretHash: v.string(),
    kind: rateLimitKindValidator,
  },
  handler: async (ctx, { secretHash, kind }) => {
    const key = await ctx.db
      .query("mcpKeys")
      .withIndex("by_secret_hash", (q) => q.eq("secretHash", secretHash))
      .first();
    if (!key || key.revokedAt !== undefined) {
      return { ok: false, code: "unauthorized" };
    }

    const now = Date.now();
    const windowStart = Math.floor(now / MCP_RATE_WINDOW_MS) * MCP_RATE_WINDOW_MS;
    const limit = kind === "write" ? MCP_WRITES_PER_MINUTE : MCP_READS_PER_MINUTE;
    const bucket = await ctx.db
      .query("mcpRateLimits")
      .withIndex("by_key_kind_window", (q) =>
        q.eq("keyId", key._id).eq("kind", kind).eq("windowStart", windowStart)
      )
      .first();

    if (bucket && bucket.count >= limit) {
      return {
        ok: false,
        code: "rate_limited",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowStart + MCP_RATE_WINDOW_MS - now) / 1000)
        ),
      };
    }

    if (bucket) {
      await ctx.db.patch(bucket._id, {
        count: bucket.count + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("mcpRateLimits", {
        keyId: key._id,
        kind,
        windowStart,
        count: 1,
        updatedAt: now,
      });
    }
    await ctx.db.patch(key._id, { lastUsedAt: now });
    return { ok: true, userId: key.userId, keyId: key._id };
  },
});

export const recordAudit = internalMutation({
  args: {
    userId: v.id("users"),
    keyId: v.id("mcpKeys"),
    toolName: v.string(),
    entryId: v.optional(v.id("entries")),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpAuditEvents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

async function resolveMentions(
  ctx: MutationCtx,
  raw: string,
  author: Id<"users">
): Promise<Id<"users">[]> {
  const tokens = parseMentionTokens(raw);
  if (tokens.length === 0) return [];
  const users = await ctx.db.query("users").collect();
  const others = users.filter((user) => user._id !== author);

  if (tokens.includes("all")) return others.map((user) => user._id);

  const ids: Id<"users">[] = [];
  for (const token of tokens) {
    const match = others.find((user) => firstNameKey(user.name ?? user.email) === token);
    if (match && !ids.includes(match._id)) ids.push(match._id);
  }
  return ids;
}

async function visibleEntryDocs(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"entries">[]> {
  const mine = await ctx.db
    .query("entries")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const all = await ctx.db.query("entries").collect();
  const mentioned = all.filter(
    (entry) => entry.userId !== userId && (entry.mentions ?? []).includes(userId)
  );
  return [...mine, ...mentioned];
}

async function accessibleEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: string
): Promise<Doc<"entries">> {
  const entryId = ctx.db.normalizeId("entries", id);
  if (!entryId) throw new Error("Entry not found");
  const entry = await ctx.db.get(entryId);
  const canAccess =
    entry && (entry.userId === userId || (entry.mentions ?? []).includes(userId));
  if (!canAccess) throw new Error("Entry not found");
  return entry;
}

function userDisplayName(user: Doc<"users"> | null | undefined): string {
  return (user?.name ?? user?.email ?? "Someone").trim();
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] || "Someone";
}

async function userMapForEntries(ctx: QueryCtx | MutationCtx, entries: Doc<"entries">[]) {
  const ids = new Set<Id<"users">>();
  for (const entry of entries) {
    ids.add(entry.userId);
    for (const mentioned of entry.mentions ?? []) ids.add(mentioned);
  }

  const users: Record<string, PersonRef> = {};
  for (const id of ids) {
    const user = await ctx.db.get(id);
    const name = userDisplayName(user);
    users[id] = { id, name, firstName: firstName(name) };
  }
  return users;
}

function formatEntry(
  entry: Doc<"entries">,
  userId: Id<"users">,
  users: Record<string, PersonRef>,
  detail: "summary" | "full" = "full"
): FormattedEntry {
  const createdAt = entry.createdAt ?? entry._creationTime;
  const updatedAt = entry.updatedAt ?? createdAt;
  const author = users[entry.userId] ?? {
    id: entry.userId,
    name: "Someone",
    firstName: "Someone",
  };
  const payload: FormattedEntry = {
    id: entry._id,
    raw: entry.raw,
    body: entry.body,
    tags: entry.tags,
    createdAtMs: createdAt,
    createdAtIso: iso(createdAt),
    updatedAtMs: updatedAt,
    updatedAtIso: iso(updatedAt),
    edited: entry.edited,
    done: entry.done || entry.tags.includes("done"),
    pinned: entry.pinned,
    status: entry.status,
    order: entry.order,
    authorId: entry.userId,
    authorName: author.firstName,
    isMine: entry.userId === userId,
    mentions: (entry.mentions ?? [])
      .map((id) => users[id])
      .filter((person): person is PersonRef => person !== undefined),
  };
  if (detail === "summary" && payload.body.length > 240) {
    payload.bodyPreview = `${payload.body.slice(0, 237)}...`;
  }
  return payload;
}

async function formatEntries(
  ctx: QueryCtx | MutationCtx,
  entries: Doc<"entries">[],
  userId: Id<"users">,
  detail: "summary" | "full" = "full"
) {
  const users = await userMapForEntries(ctx, entries);
  return entries.map((entry) => formatEntry(entry, userId, users, detail));
}

function lower(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function offsetFromCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const profileGet = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const settings = await settingsForUser(ctx, userId);
    const entries = await visibleEntryDocs(ctx, userId);
    const owned = entries.filter((entry) => entry.userId === userId);
    const shared = entries.filter((entry) => entry.userId !== userId);
    const done = entries.filter((entry) => entry.done || entry.tags.includes("done"));
    const tags = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) tags.add(tag);
    }
    return {
      profile: {
        id: userId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        image: user?.image ?? null,
      },
      taskTags: settings.taskTags,
      counts: {
        visibleEntries: entries.length,
        ownedEntries: owned.length,
        sharedEntries: shared.length,
        pinnedEntries: entries.filter((entry) => entry.pinned).length,
        doneEntries: done.length,
        openEntries: entries.length - done.length,
        tags: tags.size,
      },
    };
  },
});

export const entriesSearch = internalQuery({
  args: { userId: v.id("users"), filters: searchFiltersValidator },
  handler: async (ctx, { userId, filters }) => {
    const all = await visibleEntryDocs(ctx, userId);
    const users = await userMapForEntries(ctx, all);
    const queryText = lower(filters.query);
    const tags = (filters.tags ?? []).map((tag) => tag.toLowerCase());
    const tagMatch = filters.tagMatch ?? "any";
    const scope = filters.scope ?? "all";
    const author = lower(filters.author);
    const mention = lower(filters.mention);

    let rows = all.filter((entry) => {
      const createdAt = entry.createdAt ?? entry._creationTime;
      const updatedAt = entry.updatedAt ?? createdAt;
      const isDone = entry.done || entry.tags.includes("done");
      const authorRef = users[entry.userId];
      const mentionRefs = (entry.mentions ?? []).map((id) => users[id]);

      if (queryText) {
        const haystack = [
          entry.raw,
          entry.body,
          entry.tags.join(" "),
          authorRef?.name ?? "",
          mentionRefs.map((person) => person?.name ?? "").join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }

      if (tags.length > 0) {
        const matched =
          tagMatch === "all"
            ? tags.every((tag) => entry.tags.includes(tag))
            : tags.some((tag) => entry.tags.includes(tag));
        if (!matched) return false;
      }

      if (filters.status && entry.status !== filters.status) return false;
      if (typeof filters.done === "boolean" && isDone !== filters.done) return false;
      if (typeof filters.pinned === "boolean" && entry.pinned !== filters.pinned) {
        return false;
      }
      if (scope === "owned" && entry.userId !== userId) return false;
      if (scope === "shared" && entry.userId === userId) return false;
      if (author) {
        const authorHaystack = `${entry.userId} ${authorRef?.name ?? ""} ${
          authorRef?.firstName ?? ""
        }`.toLowerCase();
        if (!authorHaystack.includes(author)) return false;
      }
      if (mention) {
        const mentionHaystack = mentionRefs
          .map((person) => `${person?.id ?? ""} ${person?.name ?? ""} ${person?.firstName ?? ""}`)
          .join(" ")
          .toLowerCase();
        if (!mentionHaystack.includes(mention)) return false;
      }
      if (filters.createdAfter !== undefined && createdAt < filters.createdAfter) return false;
      if (filters.createdBefore !== undefined && createdAt > filters.createdBefore) return false;
      if (filters.updatedAfter !== undefined && updatedAt < filters.updatedAfter) return false;
      if (filters.updatedBefore !== undefined && updatedAt > filters.updatedBefore) return false;
      return true;
    });

    const sort = filters.sort ?? "created_desc";
    rows = [...rows].sort((a, b) => {
      const aCreated = a.createdAt ?? a._creationTime;
      const bCreated = b.createdAt ?? b._creationTime;
      const aUpdated = a.updatedAt ?? aCreated;
      const bUpdated = b.updatedAt ?? bCreated;
      if (sort === "created_asc") return aCreated - bCreated;
      if (sort === "updated_desc") return bUpdated - aUpdated;
      if (sort === "updated_asc") return aUpdated - bUpdated;
      if (sort === "manual") return a.order - b.order || aCreated - bCreated;
      return bCreated - aCreated;
    });

    const limit = clampLimit(filters.limit);
    const offset = offsetFromCursor(filters.cursor);
    const page = rows.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      entries: page.map((entry) =>
        formatEntry(entry, userId, users, filters.detail ?? "full")
      ),
      nextCursor: nextOffset < rows.length ? String(nextOffset) : null,
      total: rows.length,
      limit,
    };
  },
});

export const entryGet = internalQuery({
  args: { userId: v.id("users"), id: v.string() },
  handler: async (ctx, { userId, id }) => {
    const entryId = ctx.db.normalizeId("entries", id);
    if (!entryId) return null;
    const entry = await ctx.db.get(entryId);
    if (!entry || (entry.userId !== userId && !(entry.mentions ?? []).includes(userId))) {
      return null;
    }
    return (await formatEntries(ctx, [entry], userId))[0];
  },
});

export const tagsList = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const entries = await visibleEntryDocs(ctx, userId);
    const tags: Record<string, { tag: string; count: number; recentUsedAt: number }> = {};
    for (const entry of entries) {
      const updatedAt = entry.updatedAt ?? entry.createdAt ?? entry._creationTime;
      for (const tag of entry.tags) {
        const current = tags[tag] ?? { tag, count: 0, recentUsedAt: 0 };
        current.count += 1;
        current.recentUsedAt = Math.max(current.recentUsedAt, updatedAt);
        tags[tag] = current;
      }
    }
    return {
      tags: Object.values(tags)
        .map((tag) => ({ ...tag, recentUsedAtIso: iso(tag.recentUsedAt) }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    };
  },
});

export const collaboratorsList = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const entries = await visibleEntryDocs(ctx, userId);
    const users = await userMapForEntries(ctx, entries);
    const collaborators: Record<
      string,
      { id: string; name: string; firstName: string; roles: string[]; sharedEntryCount: number }
    > = {};

    const touch = (id: Id<"users">, role: "author" | "mentioned") => {
      if (id === userId) return;
      const person = users[id];
      if (!person) return;
      const current = collaborators[id] ?? {
        ...person,
        roles: [],
        sharedEntryCount: 0,
      };
      if (!current.roles.includes(role)) current.roles.push(role);
      current.sharedEntryCount += 1;
      collaborators[id] = current;
    };

    for (const entry of entries) {
      touch(entry.userId, "author");
      for (const mentioned of entry.mentions ?? []) touch(mentioned, "mentioned");
    }

    return {
      collaborators: Object.values(collaborators).sort((a, b) =>
        a.firstName.localeCompare(b.firstName)
      ),
    };
  },
});

export const entryCreate = internalMutation({
  args: { userId: v.id("users"), raw: v.string() },
  handler: async (ctx, { userId, raw }) => {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("Entry text is required");
    const { tags, body } = parseEntry(trimmed);
    const mentions = await resolveMentions(ctx, trimmed, userId);
    const now = Date.now();
    const id = await ctx.db.insert("entries", {
      userId,
      raw: trimmed,
      body,
      tags,
      createdAt: now,
      updatedAt: now,
      edited: false,
      done: false,
      pinned: false,
      status: "todo",
      order: now,
      mentions,
    });
    const entry = await ctx.db.get(id);
    return entry ? (await formatEntries(ctx, [entry], userId))[0] : null;
  },
});

export const entryUpdateText = internalMutation({
  args: { userId: v.id("users"), id: v.string(), raw: v.string() },
  handler: async (ctx, { userId, id, raw }) => {
    const entry = await accessibleEntry(ctx, userId, id);
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("Entry text is required");
    const { tags, body } = parseEntry(trimmed);
    const mentions = await resolveMentions(ctx, trimmed, entry.userId);
    await ctx.db.patch(entry._id, {
      raw: trimmed,
      body,
      tags,
      mentions,
      edited: true,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(entry._id);
    return updated ? (await formatEntries(ctx, [updated], userId))[0] : null;
  },
});

export const entrySetState = internalMutation({
  args: {
    userId: v.id("users"),
    id: v.string(),
    status: v.optional(statusValidator),
    done: v.optional(v.boolean()),
    pinned: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const entry = await accessibleEntry(ctx, args.userId, args.id);
    const settings = await settingsForUser(ctx, args.userId);
    const patch: {
      raw?: string;
      body?: string;
      tags?: string[];
      done?: boolean;
      pinned?: boolean;
      status?: TaskStatus;
      order?: number;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    let nextStatus = args.status;
    if (!nextStatus && typeof args.done === "boolean") {
      nextStatus = args.done ? "done" : entry.status === "done" ? "todo" : entry.status;
    }
    if (nextStatus) {
      Object.assign(patch, applyStatus(entry, nextStatus, settings.taskTags), {
        status: nextStatus,
      });
    }
    if (typeof args.pinned === "boolean") patch.pinned = args.pinned;
    if (typeof args.order === "number" && Number.isFinite(args.order)) {
      patch.order = args.order;
    }

    await ctx.db.patch(entry._id, patch);
    const updated = await ctx.db.get(entry._id);
    return updated ? (await formatEntries(ctx, [updated], args.userId))[0] : null;
  },
});
