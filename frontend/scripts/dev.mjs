import esbuild from "esbuild";

const context = await esbuild.context({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  define: {
    "process.env.API_URL": JSON.stringify(process.env.API_URL ?? "http://localhost:4000/api")
  },
  sourcemap: true,
  outdir: "dist/assets",
  entryNames: "app",
  assetNames: "assets/[name]",
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file",
    ".webp": "file"
  }
});

await context.watch();
const server = await context.serve({
  servedir: ".",
  host: "0.0.0.0",
  port: 8000
});

console.log(`Frontend listening on http://${server.host}:${server.port}`);
