import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { applyStatus, parseEntry, parseMentionTokens, firstNameKey } from "./lib";

const statusValidator = v.union(
  v.literal("todo"),
  v.literal("doing"),
  v.literal("done")
);

/** Require a signed-in user; throw otherwise. */
async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/**
 * Resolve @first-name tokens in raw text to user IDs (deduped, excludes author).
 * The special token `@all` expands to every other user in the database.
 */
async function resolveMentions(
  ctx: MutationCtx,
  raw: string,
  author: Id<"users">
): Promise<Id<"users">[]> {
  const tokens = parseMentionTokens(raw);
  if (tokens.length === 0) return [];
  const users = await ctx.db.query("users").collect();
  const others = users.filter((u) => u._id !== author);

  // @all → everyone else, no need to resolve the rest.
  if (tokens.includes("all")) return others.map((u) => u._id);

  const ids: Id<"users">[] = [];
  for (const t of tokens) {
    const match = others.find((u) => firstNameKey(u.name ?? u.email) === t);
    if (match && !ids.includes(match._id)) ids.push(match._id);
  }
  return ids;
}

/** Load an entry the caller may act on (author OR mentioned = full shared edit). */
async function accessibleEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"entries">
): Promise<Doc<"entries">> {
  const entry = await ctx.db.get(id);
  const canAccess =
    entry && (entry.userId === userId || (entry.mentions ?? []).includes(userId));
  if (!canAccess) throw new Error("Entry not found");
  return entry;
}

/**
 * Entries the signed-in user authored OR was @mentioned in, each annotated with
 * the author's first name + whether the caller is the author.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const mine = await ctx.db
      .query("entries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Entries where I'm mentioned (authored by others). No array index in Convex,
    // so scan + filter — fine at this scale (small team).
    const all = await ctx.db.query("entries").collect();
    const mentioned = all.filter(
      (e) => e.userId !== userId && (e.mentions ?? []).includes(userId)
    );

    const combined = [...mine, ...mentioned];

    // Resolve author first names once.
    const authorIds = Array.from(new Set(combined.map((e) => e.userId)));
    const authorName: Record<string, string> = {};
    for (const aid of authorIds) {
      const u = await ctx.db.get(aid);
      authorName[aid] = (u?.name ?? u?.email ?? "Someone").trim().split(/\s+/)[0];
    }

    return combined.map((e) => ({
      ...e,
      authorId: e.userId,
      authorName: authorName[e.userId],
      isMine: e.userId === userId,
    }));
  },
});

/** Create an entry from raw text, resolving any @mentions. */
export const add = mutation({
  args: { raw: v.string() },
  handler: async (ctx, { raw }) => {
    const userId = await requireUser(ctx);
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const { tags, body } = parseEntry(trimmed);
    const mentions = await resolveMentions(ctx, trimmed, userId);
    const now = Date.now();
    return await ctx.db.insert("entries", {
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
  },
});

/** Edit an entry's raw text, reparsing body/tags/mentions. */
export const update = mutation({
  args: { id: v.id("entries"), raw: v.string() },
  handler: async (ctx, { id, raw }) => {
    const userId = await requireUser(ctx);
    const entry = await accessibleEntry(ctx, userId, id);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const { tags, body } = parseEntry(trimmed);
    // Mentions resolve against the original author (so editing as a mentioned
    // collaborator doesn't accidentally drop the author or add themselves).
    const mentions = await resolveMentions(ctx, trimmed, entry.userId);
    await ctx.db.patch(id, {
      raw: trimmed,
      body,
      tags,
      mentions,
      edited: true,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("entries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    await accessibleEntry(ctx, userId, id);
    await ctx.db.delete(id);
  },
});

/**
 * Re-create a previously-deleted entry from its raw text, preserving the flags
 * that aren't derivable from raw (done/pinned/status/order/createdAt). Used by
 * client-side undo; mentions re-resolve from the raw text. Returns the new id.
 */
export const restore = mutation({
  args: {
    raw: v.string(),
    done: v.boolean(),
    pinned: v.boolean(),
    status: statusValidator,
    order: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, { raw, done, pinned, status, order, createdAt }) => {
    const userId = await requireUser(ctx);
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const { tags, body } = parseEntry(trimmed);
    const mentions = await resolveMentions(ctx, trimmed, userId);
    return await ctx.db.insert("entries", {
      userId,
      raw: trimmed,
      body,
      tags,
      createdAt,
      updatedAt: Date.now(),
      edited: false,
      done,
      pinned,
      status,
      order,
      mentions,
    });
  },
});

/** Toggle a task between done and todo, syncing /do↔/done. */
export const toggleDone = mutation({
  args: { id: v.id("entries"), taskTags: v.array(v.string()) },
  handler: async (ctx, { id, taskTags }) => {
    const userId = await requireUser(ctx);
    const entry = await accessibleEntry(ctx, userId, id);
    const next = entry.done || entry.tags.includes("done") ? "todo" : "done";
    const changed = applyStatus(entry, next, taskTags);
    await ctx.db.patch(id, { ...changed, status: next });
  },
});

export const togglePin = mutation({
  args: { id: v.id("entries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const entry = await accessibleEntry(ctx, userId, id);
    await ctx.db.patch(id, { pinned: !entry.pinned });
  },
});

/** Board drag: set column + manual position, syncing done/tag. */
export const moveCard = mutation({
  args: {
    id: v.id("entries"),
    status: statusValidator,
    order: v.number(),
    taskTags: v.array(v.string()),
  },
  handler: async (ctx, { id, status, order, taskTags }) => {
    const userId = await requireUser(ctx);
    const entry = await accessibleEntry(ctx, userId, id);
    const changed = applyStatus(entry, status, taskTags);
    await ctx.db.patch(id, { ...changed, status, order });
  },
});

/** List manual reorder: set position without changing status. */
export const setOrder = mutation({
  args: { id: v.id("entries"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const userId = await requireUser(ctx);
    await accessibleEntry(ctx, userId, id);
    await ctx.db.patch(id, { order });
  },
});
