import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { firstNameKey } from "./lib";

/** The signed-in user's profile (null when logged out). */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { name: user.name, email: user.email, image: user.image };
  },
});

/** All users, for the @mention people picker (requires being signed in). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) return [];
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      id: u._id,
      name: u.name ?? u.email ?? "Someone",
      firstName: (u.name ?? u.email ?? "Someone").trim().split(/\s+/)[0],
      firstNameKey: firstNameKey(u.name ?? u.email),
      image: u.image,
      isMe: u._id === me,
    }));
  },
});
