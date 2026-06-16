import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  // Convex Auth tables (users, authAccounts, authSessions, …).
  ...authTables,

  // One row per logged entry, scoped to the user who created it.
  entries: defineTable({
    userId: v.id("users"),
    /** Raw text the user typed, including leading /tags. */
    raw: v.string(),
    /** Text with /tags stripped (derived from raw, stored). */
    body: v.string(),
    /** Lowercased tag names parsed from raw (derived, stored). */
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    edited: v.boolean(),
    /** Completed — meaningful for task entries. */
    done: v.boolean(),
    /** Pinned to the top focus section. */
    pinned: v.boolean(),
    /** Kanban column. */
    status: v.union(v.literal("todo"), v.literal("doing"), v.literal("done")),
    /** Manual sort position (board column + list "manual" sort). */
    order: v.number(),
    /** Users @mentioned on this entry — they also see + can edit it. Optional
     *  so pre-existing rows (written before mentions existed) stay valid. */
    mentions: v.optional(v.array(v.id("users"))),
  }).index("by_user", ["userId"]),
});
