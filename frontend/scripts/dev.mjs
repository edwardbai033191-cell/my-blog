import esbuild from "esbuild";

const context = await esbuild.context({
  entryPoints: ["src/main.tsx"],
  bundle: true,
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
