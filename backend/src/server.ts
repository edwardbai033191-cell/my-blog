import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createApp } from "./app.js";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const port = Number(process.env.PORT ?? 4000);
const app = await createApp();

app.listen(port, () => {
  console.log(`Blog API listening on http://localhost:${port}`);
});
