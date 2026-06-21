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
    /** The single "right now" focus task. At most one true per user.
     *  Optional so pre-existing rows stay valid. */
    focused: v.optional(v.boolean()),
    /** Kanban column. */
    status: v.union(v.literal("todo"), v.literal("doing"), v.literal("done")),
    /** Manual sort position (board column + list "manual" sort). */
    order: v.number(),
    /** Users @mentioned on this entry — they also see + can edit it. Optional
     *  so pre-existing rows (written before mentions existed) stay valid. */
    mentions: v.optional(v.array(v.id("users"))),
  }).index("by_user", ["userId"]),

  mcpKeys: defineTable({
    userId: v.id("users"),
    /** Plaintext by product choice so Settings can always reveal/copy it. */
    secret: v.string(),
    /** SHA-256(secret), indexed for MCP bearer-token lookup. */
    secretHash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_secret_hash", ["secretHash"]),

  userSettings: defineTable({
    userId: v.id("users"),
    taskTags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  mcpAuditEvents: defineTable({
    userId: v.id("users"),
    keyId: v.id("mcpKeys"),
    toolName: v.string(),
    entryId: v.optional(v.id("entries")),
    success: v.boolean(),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_key", ["keyId"]),

  mcpRateLimits: defineTable({
    keyId: v.id("mcpKeys"),
    kind: v.union(v.literal("read"), v.literal("write")),
    windowStart: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_key_kind_window", ["keyId", "kind", "windowStart"]),
});
