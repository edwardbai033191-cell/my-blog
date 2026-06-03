import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = await createApp();

app.listen(port, () => {
  console.log(`Blog API listening on http://localhost:${port}`);
});
