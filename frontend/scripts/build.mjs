import { copyFile, mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("dist", { recursive: true });
await mkdir("dist/assets", { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  define: {
    "process.env.API_URL": JSON.stringify(process.env.API_URL ?? "")
  },
  minify: true,
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

await copyFile("index.html", "dist/index.html");
