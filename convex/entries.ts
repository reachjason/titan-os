import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { applyStatus, parseEntry } from "./lib";

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

/** Load an entry and assert the caller owns it. */
async function ownEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"entries">
): Promise<Doc<"entries">> {
  const entry = await ctx.db.get(id);
  if (!entry || entry.userId !== userId) throw new Error("Entry not found");
  return entry;
}

/** All of the signed-in user's entries (empty when logged out). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("entries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Create an entry from raw text. */
export const add = mutation({
  args: { raw: v.string() },
  handler: async (ctx, { raw }) => {
    const userId = await requireUser(ctx);
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const { tags, body } = parseEntry(trimmed);
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
    });
  },
});

/** Edit an entry's raw text, reparsing body/tags. */
export const update = mutation({
  args: { id: v.id("entries"), raw: v.string() },
  handler: async (ctx, { id, raw }) => {
    const userId = await requireUser(ctx);
    await ownEntry(ctx, userId, id);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const { tags, body } = parseEntry(trimmed);
    await ctx.db.patch(id, { raw: trimmed, body, tags, edited: true, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("entries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    await ownEntry(ctx, userId, id);
    await ctx.db.delete(id);
  },
});

/** Toggle a task between done and todo, syncing /do↔/done. */
export const toggleDone = mutation({
  args: { id: v.id("entries"), taskTags: v.array(v.string()) },
  handler: async (ctx, { id, taskTags }) => {
    const userId = await requireUser(ctx);
    const entry = await ownEntry(ctx, userId, id);
    const next = entry.done || entry.tags.includes("done") ? "todo" : "done";
    const changed = applyStatus(entry, next, taskTags);
    await ctx.db.patch(id, { ...changed, status: next });
  },
});

export const togglePin = mutation({
  args: { id: v.id("entries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const entry = await ownEntry(ctx, userId, id);
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
    const entry = await ownEntry(ctx, userId, id);
    const changed = applyStatus(entry, status, taskTags);
    await ctx.db.patch(id, { ...changed, status, order });
  },
});

/** List manual reorder: set position without changing status. */
export const setOrder = mutation({
  args: { id: v.id("entries"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const userId = await requireUser(ctx);
    await ownEntry(ctx, userId, id);
    await ctx.db.patch(id, { order });
  },
});
