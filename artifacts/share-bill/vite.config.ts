import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { Plugin } from "vite";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

function htmlRoutePlugin(base: string): Plugin {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  const rewrite = (
    req: { url?: string },
    _res: unknown,
    next: () => void,
  ) => {
    const url = req.url ?? "/";
    const withoutBase = url.startsWith(base) ? url.slice(base.length) : url;
    const pathname = (withoutBase.split("?")[0] ?? "/").replace(/^\/+/, "");
    if (/^b\/[A-Za-z0-9]+$/.test(pathname)) {
      req.url = `${normalizedBase}/app.html`;
    } else if (pathname === "privacy" || pathname === "privacy/") {
      req.url = `${normalizedBase}/privacy.html`;
    } else if (pathname === "support" || pathname === "support/") {
      req.url = `${normalizedBase}/support.html`;
    }
    next();
  };

  return {
    name: "html-routes",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    htmlRoutePlugin(basePath),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        marketing: path.resolve(import.meta.dirname, "index.html"),
        app: path.resolve(import.meta.dirname, "app.html"),
        privacy: path.resolve(import.meta.dirname, "privacy.html"),
        support: path.resolve(import.meta.dirname, "support.html"),
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
