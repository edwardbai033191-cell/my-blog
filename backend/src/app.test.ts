import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { newDb } from "pg-mem";
import type { Pool as PgPool } from "pg";
import request from "supertest";
import { createApp } from "./app.js";
import { createPostStore } from "./database.js";

const createTestStore = async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool() as unknown as PgPool;

  return createPostStore(pool);
};

const createTestApp = async () => {
  return createApp(await createTestStore());
};

describe("blog API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  const register = async (name = "Editor", email = "editor@example.com") => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name, email, password: "strong-password" })
      .expect(201);

    return response.body as { user: { id: string; name: string; email: string }; token: string };
  };

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("reports health", async () => {
    const response = await request(app).get("/api/health").expect(200);

    assert.deepEqual(response.body, { status: "ok" });
  });

  it("lists seeded published posts", async () => {
    const response = await request(app).get("/api/posts").expect(200);

    assert.equal(response.body.length, 2);
    assert.equal(response.body[0].title, "Shipping Small");
    assert.equal(response.body[0].status, "published");
  });

  it("creates a published markdown post", async () => {
    const account = await register();
    const response = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${account.token}`)
      .send({
        title: "Release Notes",
        excerpt: "A short summary for the archive.",
        content: "## Done\n\n- Added tests\n- Kept markdown",
        status: "published"
      })
      .expect(201);

    assert.deepEqual(
      {
        title: response.body.title,
        excerpt: response.body.excerpt,
        content: response.body.content,
        author: response.body.author,
        status: response.body.status
      },
      {
      title: "Release Notes",
      excerpt: "A short summary for the archive.",
      content: "## Done\n\n- Added tests\n- Kept markdown",
      author: "Editor",
      status: "published"
      }
    );
    assert.match(response.body.id, /^release-notes-/);
    assert.equal(typeof response.body.createdAt, "string");
    assert.equal(typeof response.body.updatedAt, "string");
  });

  it("saves and filters drafts", async () => {
    const account = await register();
    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${account.token}`)
      .send({
        title: "Private Sketch",
        excerpt: "A note that is not ready yet.",
        content: "Still shaping this.",
        status: "draft"
      })
      .expect(201);

    const publicResponse = await request(app).get("/api/posts").expect(200);
    const response = await request(app)
      .get("/api/posts")
      .set("Authorization", `Bearer ${account.token}`)
      .expect(200);

    assert.equal(publicResponse.body.length, 2);
    assert.equal(response.body.length, 3);
    assert.equal(response.body[0].title, "Private Sketch");
    assert.equal(response.body[0].author, "Editor");
    assert.equal(response.body[0].status, "draft");
  });

  it("rejects posts without required fields", async () => {
    const account = await register();
    const response = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${account.token}`)
      .send({
        title: "Missing body",
        excerpt: "No content"
      })
      .expect(400);

    assert.deepEqual(response.body, {
      message: "Title, excerpt, and content are required"
    });
  });

  it("deletes a post", async () => {
    const account = await register();
    const created = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${account.token}`)
      .send({
        title: "Temporary Post",
        excerpt: "This one will be removed.",
        content: "Delete me."
      })
      .expect(201);

    await request(app)
      .delete(`/api/posts/${created.body.id}`)
      .set("Authorization", `Bearer ${account.token}`)
      .expect(204);
    await request(app).get(`/api/posts/${created.body.id}`).expect(404);
  });

  it("registers, restores, logs out, and logs back in", async () => {
    const account = await register("Mina", "mina@example.com");

    assert.equal(account.user.name, "Mina");
    assert.equal(account.user.email, "mina@example.com");
    assert.equal(typeof account.token, "string");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${account.token}`)
      .expect(200);
    assert.equal(me.body.user.id, account.user.id);

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${account.token}`)
      .expect(204);
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${account.token}`)
      .expect(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "mina@example.com", password: "strong-password" })
      .expect(200);
    assert.equal(login.body.user.id, account.user.id);
  });

  it("requires authentication and ownership for post changes", async () => {
    await request(app)
      .post("/api/posts")
      .send({ title: "No", excerpt: "No", content: "No" })
      .expect(401);

    const owner = await register("Owner", "owner@example.com");
    const visitor = await register("Visitor", "visitor@example.com");
    const created = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Owned", excerpt: "Private", content: "Mine" })
      .expect(201);

    await request(app)
      .delete(`/api/posts/${created.body.id}`)
      .set("Authorization", `Bearer ${visitor.token}`)
      .expect(404);
  });

  it("allows admins to view users and moderate any post", async () => {
    const store = await createTestStore();
    const admin = await store.registerUser(
      "Administrator",
      "admin@example.com",
      "strong-password",
      "admin"
    );
    assert.ok(admin);
    const adminToken = await store.createSession(admin.id);
    const adminApp = await createApp(store);

    const owner = await request(adminApp)
      .post("/api/auth/register")
      .send({ name: "Writer", email: "writer@example.com", password: "strong-password" })
      .expect(201);
    const post = await request(adminApp)
      .post("/api/posts")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .send({ title: "Moderate Me", excerpt: "Review", content: "Content" })
      .expect(201);

    const overview = await request(adminApp)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(overview.body.users.length, 2);
    assert.equal(
      overview.body.users.find((user: { email: string }) => user.email === "admin@example.com").role,
      "admin"
    );
    assert.equal(
      overview.body.users.find((user: { email: string }) => user.email === "writer@example.com").role,
      "user"
    );
    assert.equal(overview.body.posts.length, 3);

    await request(adminApp)
      .delete(`/api/admin/posts/${post.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);
  });

  it("blocks normal users from admin routes", async () => {
    const account = await register();

    await request(app)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${account.token}`)
      .expect(403);
  });
});
