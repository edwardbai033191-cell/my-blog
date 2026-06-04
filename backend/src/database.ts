import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
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

const rowToPost = (row: Record<string, unknown>): Post => ({
  id: String(row.id),
  title: String(row.title),
  excerpt: String(row.excerpt),
  content: String(row.content),
  author: String(row.author),
  userId: row.user_id ? String(row.user_id) : null,
  status: row.status === "draft" ? "draft" : "published",
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const rowToUser = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  name: String(row.name),
  email: String(row.email),
  role: row.role === "admin" ? "admin" : "user",
  createdAt: new Date(String(row.created_at)).toISOString()
});

export const createId = (title: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${slug || "post"}-${Date.now().toString(36)}`;
};

const createDefaultPool = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
};

export const createPostStore = async (pool: Pool = createDefaultPool()) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  for (const post of samplePosts) {
    await pool.query(
      `
        INSERT INTO posts (id, title, excerpt, content, author, user_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          excerpt = EXCLUDED.excerpt,
          content = EXCLUDED.content,
          updated_at = EXCLUDED.updated_at
        WHERE posts.author = 'Admin';
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
  }

  return {
    async listPosts(userId?: string) {
      const result = await pool.query(
        `
          SELECT * FROM posts
          WHERE status = 'published' OR user_id = $1
          ORDER BY updated_at DESC;
        `,
        [userId ?? null]
      );
      return result.rows.map(rowToPost);
    },

    async getPost(id: string, userId?: string) {
      const result = await pool.query(
        `
          SELECT * FROM posts
          WHERE id = $1 AND (status = 'published' OR user_id = $2)
          LIMIT 1;
        `,
        [id, userId ?? null]
      );
      return result.rows[0] ? rowToPost(result.rows[0]) : null;
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

      await pool.query(
        `
          INSERT INTO posts (id, title, excerpt, content, author, user_id, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
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

      return post;
    },

    async deletePost(id: string, userId: string) {
      const result = await pool.query("DELETE FROM posts WHERE id = $1 AND user_id = $2;", [
        id,
        userId
      ]);
      return (result.rowCount ?? 0) > 0;
    },

    async registerUser(
      name: string,
      email: string,
      password: string,
      role: "user" | "admin" = "user"
    ) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE email = $1;", [
        normalizedEmail
      ]);
      if (existing.rowCount) {
        return null;
      }

      const user: User = {
        id: `user-${randomBytes(12).toString("hex")}`,
        name: name.trim(),
        email: normalizedEmail,
        role,
        createdAt: new Date().toISOString()
      };
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");

      await pool.query(
        `
          INSERT INTO users (id, name, email, role, password_hash, password_salt, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [user.id, user.name, user.email, user.role, hash, salt, user.createdAt]
      );
      return user;
    },

    async ensureAdmin(name: string, email: string, password: string) {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await pool.query(
        "UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id;",
        [normalizedEmail]
      );
      if (!result.rowCount) {
        await this.registerUser(name, normalizedEmail, password, "admin");
      }
    },

    async authenticateUser(email: string, password: string) {
      const result = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1;", [
        email.trim().toLowerCase()
      ]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const actual = Buffer.from(String(row.password_hash), "hex");
      const expected = scryptSync(password, String(row.password_salt), 64);
      return timingSafeEqual(actual, expected) ? rowToUser(row) : null;
    },

    async createSession(userId: string) {
      const token = randomBytes(32).toString("hex");
      await pool.query("INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3);", [
        token,
        userId,
        new Date().toISOString()
      ]);
      return token;
    },

    async getUserForSession(token: string) {
      const result = await pool.query(
        `
          SELECT users.*
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = $1
          LIMIT 1;
        `,
        [token]
      );
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    },

    async deleteSession(token: string) {
      await pool.query("DELETE FROM sessions WHERE token = $1;", [token]);
    },

    async listUsers() {
      const result = await pool.query(
        "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC;"
      );
      return result.rows.map(rowToUser);
    },

    async listAllPosts() {
      const result = await pool.query("SELECT * FROM posts ORDER BY updated_at DESC;");
      return result.rows.map(rowToPost);
    },

    async deleteAnyPost(id: string) {
      const result = await pool.query("DELETE FROM posts WHERE id = $1;", [id]);
      return (result.rowCount ?? 0) > 0;
    }
  };
};

export type PostStore = Awaited<ReturnType<typeof createPostStore>>;
