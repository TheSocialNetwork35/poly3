import { defineConfig, type ProxyOptions } from "vite";

const polyTrackProxy: Record<string, string | ProxyOptions> = {
  "/api/polytrack": {
    target: "https://vps.kodub.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/polytrack/, ""),
    configure(proxy) {
      proxy.on("proxyReq", (proxyRequest) => {
        proxyRequest.removeHeader("origin");
        proxyRequest.removeHeader("referer");
      });
    },
  },
};

export default defineConfig({
  publicDir: ".runtime",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    proxy: polyTrackProxy,
  },
  preview: {
    host: "127.0.0.1",
    proxy: polyTrackProxy,
  },
});
