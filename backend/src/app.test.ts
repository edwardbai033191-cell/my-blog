import { mkdtemp } from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import { createPostStore } from "./database.js";

const createTestApp = async () => {
  const directory = await mkdtemp(join(tmpdir(), "my-blog-api-"));
  const store = await createPostStore(join(directory, "blog.sqlite"));

  return createApp(store);
};

describe("blog API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

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
    const response = await request(app)
      .post("/api/posts")
      .send({
        title: "Release Notes",
        excerpt: "A short summary for the archive.",
        content: "## Done\n\n- Added tests\n- Kept markdown",
        author: "Editor",
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
    await request(app)
      .post("/api/posts")
      .send({
        title: "Private Sketch",
        excerpt: "A note that is not ready yet.",
        content: "Still shaping this.",
        status: "draft"
      })
      .expect(201);

    const response = await request(app).get("/api/posts?status=draft").expect(200);

    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].title, "Private Sketch");
    assert.equal(response.body[0].author, "Anonymous");
    assert.equal(response.body[0].status, "draft");
  });

  it("rejects posts without required fields", async () => {
    const response = await request(app)
      .post("/api/posts")
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
    const created = await request(app)
      .post("/api/posts")
      .send({
        title: "Temporary Post",
        excerpt: "This one will be removed.",
        content: "Delete me."
      })
      .expect(201);

    await request(app).delete(`/api/posts/${created.body.id}`).expect(204);
    await request(app).get(`/api/posts/${created.body.id}`).expect(404);
  });
});
