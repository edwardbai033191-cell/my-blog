import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import initSqlJs from "sql.js";
import type { Database, ParamsObject, SqlValue } from "sql.js";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type Post = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  userId: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

type DraftPost = {
  title: string;
  excerpt: string;
  content: string;
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
    userId: null,
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
    userId: null,
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
  userId: row.user_id ? String(row.user_id) : null,
  status: row.status === "draft" ? "draft" : "published",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToUser = (row: ParamsObject): User => ({
  id: String(row.id),
  name: String(row.name),
  email: String(row.email),
  createdAt: String(row.created_at)
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
      user_id TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const postColumns = db.exec("PRAGMA table_info(posts);")[0]?.values ?? [];
  if (!postColumns.some((column) => column[1] === "user_id")) {
    db.run("ALTER TABLE posts ADD COLUMN user_id TEXT;");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const existing = db.exec("SELECT COUNT(*) AS count FROM posts;");
  const count = Number(existing[0]?.values[0]?.[0] ?? 0);

  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO posts (id, title, excerpt, content, author, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    try {
      for (const post of samplePosts) {
        insert.run([
          post.id,
          post.title,
          post.excerpt,
          post.content,
          post.author,
          post.userId,
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
    listPosts(userId?: string) {
      return collect(
        db,
        `
          SELECT * FROM posts
          WHERE status = 'published' OR user_id = ?
          ORDER BY datetime(updated_at) DESC;
        `,
        [userId ?? null]
      );
    },

    getPost(id: string, userId?: string) {
      return (
        collect(
          db,
          `
            SELECT * FROM posts
            WHERE id = ? AND (status = 'published' OR user_id = ?)
            LIMIT 1;
          `,
          [id, userId ?? null]
        )[0] ?? null
      );
    },

    async createPost(input: DraftPost, user: User) {
      const now = new Date().toISOString();
      const post: Post = {
        id: createId(input.title),
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
        author: user.name,
        userId: user.id,
        status: input.status === "draft" ? "draft" : "published",
        createdAt: now,
        updatedAt: now
      };

      db.run(
        `
          INSERT INTO posts (id, title, excerpt, content, author, user_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          post.id,
          post.title,
          post.excerpt,
          post.content,
          post.author,
          post.userId,
          post.status,
          post.createdAt,
          post.updatedAt
        ]
      );

      await persist();
      return post;
    },

    async deletePost(id: string, userId: string) {
      db.run("DELETE FROM posts WHERE id = ? AND user_id = ?;", [id, userId]);
      const deleted = db.getRowsModified() > 0;

      if (deleted) {
        await persist();
      }

      return deleted;
    },

    async registerUser(name: string, email: string, password: string) {
      const normalizedEmail = email.trim().toLowerCase();
      if (db.exec("SELECT id FROM users WHERE email = ?;", [normalizedEmail]).length > 0) {
        return null;
      }

      const user: User = {
        id: `user-${randomBytes(12).toString("hex")}`,
        name: name.trim(),
        email: normalizedEmail,
        createdAt: new Date().toISOString()
      };
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");

      db.run(
        `
          INSERT INTO users (id, name, email, password_hash, password_salt, created_at)
          VALUES (?, ?, ?, ?, ?, ?);
        `,
        [user.id, user.name, user.email, hash, salt, user.createdAt]
      );
      await persist();
      return user;
    },

    authenticateUser(email: string, password: string) {
      const statement = db.prepare(
        "SELECT * FROM users WHERE email = ? LIMIT 1;",
        [email.trim().toLowerCase()]
      );

      try {
        if (!statement.step()) {
          return null;
        }

        const row = statement.getAsObject();
        const actual = Buffer.from(String(row.password_hash), "hex");
        const expected = scryptSync(password, String(row.password_salt), 64);
        return timingSafeEqual(actual, expected) ? rowToUser(row) : null;
      } finally {
        statement.free();
      }
    },

    async createSession(userId: string) {
      const token = randomBytes(32).toString("hex");
      db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?);", [
        token,
        userId,
        new Date().toISOString()
      ]);
      await persist();
      return token;
    },

    getUserForSession(token: string) {
      const statement = db.prepare(
        `
          SELECT users.*
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = ?
          LIMIT 1;
        `,
        [token]
      );

      try {
        return statement.step() ? rowToUser(statement.getAsObject()) : null;
      } finally {
        statement.free();
      }
    },

    async deleteSession(token: string) {
      db.run("DELETE FROM sessions WHERE token = ?;", [token]);
      await persist();
    }
  };
};

export type PostStore = Awaited<ReturnType<typeof createPostStore>>;
