import cors from "cors";
import express from "express";
import type { PostStore } from "./database.js";
import { createPostStore } from "./database.js";

export const createApp = async (postStore?: PostStore) => {
  const app = express();
  const posts = postStore ?? (await createPostStore());

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/posts", (req, res) => {
    const status = req.query.status === "draft" ? "draft" : undefined;
    res.json(posts.listPosts(status));
  });

  app.get("/api/posts/:id", (req, res) => {
    const post = posts.getPost(req.params.id);

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.json(post);
  });

  app.post("/api/posts", async (req, res) => {
    const { title, excerpt, content, author, status } = req.body as {
      title?: string;
      excerpt?: string;
      content?: string;
      author?: string;
      status?: "draft" | "published";
    };

    if (!title?.trim() || !excerpt?.trim() || !content?.trim()) {
      res.status(400).json({ message: "Title, excerpt, and content are required" });
      return;
    }

    const post = await posts.createPost({ title, excerpt, content, author, status });
    res.status(201).json(post);
  });

  app.delete("/api/posts/:id", async (req, res) => {
    const deleted = await posts.deletePost(req.params.id);

    if (!deleted) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(204).send();
  });

  return app;
};
