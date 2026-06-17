import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { get as mcpGet, options as mcpOptions, post as mcpPost } from "./mcpHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/mcp", method: "OPTIONS", handler: mcpOptions });
http.route({ path: "/mcp", method: "GET", handler: mcpGet });
http.route({ path: "/mcp", method: "POST", handler: mcpPost });

export default http;
