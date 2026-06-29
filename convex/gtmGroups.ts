import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * GTM group cache. Per-user metadata for the Telegram groups a user is in,
 * used so the GTM view loads instantly from Convex instead of re-fetching from
 * Telegram every time. Mirrors the auth/scoping conventions in entries.ts.
 *
 * Only NON-SENSITIVE data lives here (names, handles, member counts, the
 * user's own category tags). The Telegram session is never stored server-side.
 */

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/** Fetch the caller's own group, scoped + checked. Throws if not theirs. */
async function ownGroup(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"gtmGroups">
): Promise<Doc<"gtmGroups">> {
  const group = await ctx.db.get(id);
  if (!group || group.userId !== userId) throw new Error("Group not found");
  return group;
}

/** Look up one of the caller's groups by its Telegram id (via the upsert index). */
async function byTgId(
  ctx: MutationCtx,
  userId: Id<"users">,
  tgId: string
): Promise<Doc<"gtmGroups"> | null> {
  return await ctx.db
    .query("gtmGroups")
    .withIndex("by_user_tg", (q) => q.eq("userId", userId).eq("tgId", tgId))
    .unique();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    // Bounded read — a user's partner-group set is small; 500 is a safe cap.
    return await ctx.db
      .query("gtmGroups")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
  },
});

/**
 * Upsert a synced batch of groups. Existing groups (matched by tgId) are
 * patched in place — preserving the user's category tags; new ones are inserted
 * flagged isNew. Returns the tgIds that were newly inserted, which drives the
 * "Found N new groups" badge.
 */
export const upsertMany = mutation({
  args: {
    groups: v.array(
      v.object({
        tgId: v.string(),
        name: v.string(),
        handle: v.string(),
        members: v.number(),
        /** Optional seed categories (e.g. from the demo catalog). */
        cats: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, { groups }) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const newTgIds: string[] = [];
    for (const g of groups) {
      const existing = await byTgId(ctx, userId, g.tgId);
      if (existing) {
        // Refresh display fields; never clobber the user's own category tags.
        await ctx.db.patch(existing._id, {
          name: g.name,
          handle: g.handle,
          members: g.members,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("gtmGroups", {
          userId,
          tgId: g.tgId,
          name: g.name,
          handle: g.handle,
          members: g.members,
          cats: g.cats ?? [],
          isNew: true,
          createdAt: now,
          updatedAt: now,
        });
        newTgIds.push(g.tgId);
      }
    }
    return { newTgIds };
  },
});

/** Toggle a single category on one group. */
export const toggleCat = mutation({
  args: { id: v.id("gtmGroups"), cat: v.string() },
  handler: async (ctx, { id, cat }) => {
    const userId = await requireUser(ctx);
    const group = await ownGroup(ctx, userId, id);
    const cats = group.cats.includes(cat)
      ? group.cats.filter((c) => c !== cat)
      : [...group.cats, cat];
    await ctx.db.patch(id, { cats, updatedAt: Date.now() });
  },
});

/** Replace the full category set on one group (used by the categorize sheet). */
export const setCats = mutation({
  args: { id: v.id("gtmGroups"), cats: v.array(v.string()) },
  handler: async (ctx, { id, cats }) => {
    const userId = await requireUser(ctx);
    await ownGroup(ctx, userId, id);
    await ctx.db.patch(id, { cats, updatedAt: Date.now() });
  },
});

/**
 * Bulk toggle a category across many groups (tri-state): if every target group
 * already has the category, remove it from all; otherwise add it to all.
 * Returns whether the net action was "add".
 */
export const bulkToggleCat = mutation({
  args: { ids: v.array(v.id("gtmGroups")), cat: v.string() },
  handler: async (ctx, { ids, cat }) => {
    const userId = await requireUser(ctx);
    const groups = await Promise.all(ids.map((id) => ownGroup(ctx, userId, id)));
    if (groups.length === 0) return { added: false };
    const allHave = groups.every((g) => g.cats.includes(cat));
    const now = Date.now();
    for (const g of groups) {
      if (allHave) {
        await ctx.db.patch(g._id, { cats: g.cats.filter((c) => c !== cat), updatedAt: now });
      } else if (!g.cats.includes(cat)) {
        await ctx.db.patch(g._id, { cats: [...g.cats, cat], updatedAt: now });
      }
    }
    return { added: !allHave };
  },
});

/** Clear the isNew flag on every group (after the "new groups" badge is seen). */
export const clearNew = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const mine = await ctx.db
      .query("gtmGroups")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    const now = Date.now();
    for (const g of mine) {
      if (g.isNew) await ctx.db.patch(g._id, { isNew: false, updatedAt: now });
    }
  },
});

/** Remove all of the caller's cached groups (on disconnect / reset). */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const mine = await ctx.db
      .query("gtmGroups")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    for (const g of mine) await ctx.db.delete(g._id);
  },
});
