import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// GramJS (the `telegram` MTProto client) is a Node library; running it in the
// browser (Option A — the session must never reach a server) requires shims for
// the Node core modules it and its deps touch (buffer, util, stream, crypto,
// events, process, …). vite-plugin-node-polyfills provides them all, which is
// far more robust than hand-aliasing each one. These shims only matter on the
// broadcast path, which is code-split, so they don't bloat the initial bundle.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // GramJS reads Buffer/process/global as if in Node.
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  optimizeDeps: {
    include: ["telegram"],
  },
});
