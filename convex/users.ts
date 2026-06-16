import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

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
