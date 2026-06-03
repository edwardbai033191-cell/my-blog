import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import type { Database, ParamsObject, SqlValue } from "sql.js";

export type Post = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

type DraftPost = {
  title: string;
  excerpt: string;
  content: string;
  author?: string;
  status?: "draft" | "published";
};

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

const samplePosts: Post[] = [
  {
    id: "welcome-to-the-journal",
    title: "Welcome to the Journal",
    excerpt: "A first note to shape the archive and make the reading view feel alive.",
    content:
      "## A place to write\n\nThis journal keeps ideas somewhere durable now. Draft a piece, preview the result, and keep shaping the archive as it grows.\n\n- Browse published posts\n- Draft richer essays\n- Keep the collection ready for search, tags, and publishing workflows",
    author: "Admin",
    status: "published",
    createdAt: new Date("2026-06-03T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-03T12:00:00.000Z").toISOString()
  },
  {
    id: "shipping-small",
    title: "Shipping Small",
    excerpt: "The best publishing tools make one thoughtful loop feel complete.",
    content:
      "A good first version should leave room for the second.\n\nThis one focuses on the core loop: write, preview, publish, read, and manage the archive. It is still compact, but it no longer feels temporary.",
    author: "Admin",
    status: "published",
    createdAt: new Date("2026-06-03T13:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-03T13:00:00.000Z").toISOString()
  }
];

const rowToPost = (row: ParamsObject): Post => ({
  id: String(row.id),
  title: String(row.title),
  excerpt: String(row.excerpt),
  content: String(row.content),
  author: String(row.author),
  status: row.status === "draft" ? "draft" : "published",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const collect = (db: Database, sql: string, params?: SqlValue[]): Post[] => {
  const statement = db.prepare(sql, params ?? []);
  const rows: Post[] = [];

  try {
    while (statement.step()) {
      rows.push(rowToPost(statement.getAsObject()));
    }
  } finally {
    statement.free();
  }

  return rows;
};

export const createId = (title: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${slug || "post"}-${Date.now().toString(36)}`;
};

export const createPostStore = async (databasePath = process.env.DATABASE_PATH ?? "data/blog.sqlite") => {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  let db: Database;

  try {
    const file = await readFile(databasePath);
    db = new SQL.Database(file);
  } catch {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const existing = db.exec("SELECT COUNT(*) AS count FROM posts;");
  const count = Number(existing[0]?.values[0]?.[0] ?? 0);

  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO posts (id, title, excerpt, content, author, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);

    try {
      for (const post of samplePosts) {
        insert.run([
          post.id,
          post.title,
          post.excerpt,
          post.content,
          post.author,
          post.status,
          post.createdAt,
          post.updatedAt
        ]);
      }
    } finally {
      insert.free();
    }
  }

  for (const post of samplePosts) {
    db.run(
      `
        UPDATE posts
        SET excerpt = ?, content = ?, updated_at = ?
        WHERE id = ? AND author = 'Admin';
      `,
      [post.excerpt, post.content, post.updatedAt, post.id]
    );
  }

  const persist = async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    await writeFile(databasePath, db.export());
  };

  await persist();

  return {
    listPosts(status?: "draft" | "published") {
      if (status) {
        return collect(
          db,
          `
            SELECT * FROM posts
            WHERE status = ?
            ORDER BY datetime(updated_at) DESC;
          `,
          [status]
        );
      }

      return collect(
        db,
        `
          SELECT * FROM posts
          ORDER BY datetime(updated_at) DESC;
        `
      );
    },

    getPost(id: string) {
      return collect(db, "SELECT * FROM posts WHERE id = ? LIMIT 1;", [id])[0] ?? null;
    },

    async createPost(input: DraftPost) {
      const now = new Date().toISOString();
      const post: Post = {
        id: createId(input.title),
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
        author: input.author?.trim() || "Anonymous",
        status: input.status === "draft" ? "draft" : "published",
        createdAt: now,
        updatedAt: now
      };

      db.run(
        `
          INSERT INTO posts (id, title, excerpt, content, author, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          post.id,
          post.title,
          post.excerpt,
          post.content,
          post.author,
          post.status,
          post.createdAt,
          post.updatedAt
        ]
      );

      await persist();
      return post;
    },

    async deletePost(id: string) {
      db.run("DELETE FROM posts WHERE id = ?;", [id]);
      const deleted = db.getRowsModified() > 0;

      if (deleted) {
        await persist();
      }

      return deleted;
    }
  };
};

export type PostStore = Awaited<ReturnType<typeof createPostStore>>;
