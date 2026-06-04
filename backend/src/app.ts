import cors from "cors";
import express from "express";
import type { PostStore } from "./database.js";
import { createPostStore } from "./database.js";

export const createApp = async (postStore?: PostStore) => {
  const app = express();
  const posts = postStore ?? (await createPostStore());
  const getToken = (authorization?: string) =>
    authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const getUser = (authorization?: string) => {
    const token = getToken(authorization);
    return token ? posts.getUserForSession(token) : null;
  };

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/posts", (req, res) => {
    const user = getUser(req.headers.authorization);
    res.json(posts.listPosts(user?.id));
  });

  app.get("/api/posts/:id", (req, res) => {
    const user = getUser(req.headers.authorization);
    const post = posts.getPost(req.params.id, user?.id);

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.json(post);
  });

  app.post("/api/posts", async (req, res) => {
    const user = getUser(req.headers.authorization);
    const { title, excerpt, content, status } = req.body as {
      title?: string;
      excerpt?: string;
      content?: string;
      status?: "draft" | "published";
    };

    if (!user) {
      res.status(401).json({ message: "Sign in to write posts" });
      return;
    }

    if (!title?.trim() || !excerpt?.trim() || !content?.trim()) {
      res.status(400).json({ message: "Title, excerpt, and content are required" });
      return;
    }

    const post = await posts.createPost({ title, excerpt, content, status }, user);
    res.status(201).json(post);
  });

  app.delete("/api/posts/:id", async (req, res) => {
    const user = getUser(req.headers.authorization);

    if (!user) {
      res.status(401).json({ message: "Sign in to delete posts" });
      return;
    }

    const deleted = await posts.deletePost(req.params.id, user.id);

    if (!deleted) {
      res.status(404).json({ message: "Post not found or not owned by you" });
      return;
    }

    res.status(204).send();
  });

  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ message: "Name, email, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters" });
      return;
    }

    const user = await posts.registerUser(name, email, password);
    if (!user) {
      res.status(409).json({ message: "An account with that email already exists" });
      return;
    }

    const token = await posts.createSession(user.id);
    res.status(201).json({ user, token });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const user =
      email?.trim() && password ? posts.authenticateUser(email, password) : null;

    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = await posts.createSession(user.id);
    res.json({ user, token });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getUser(req.headers.authorization);

    if (!user) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }

    res.json({ user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = getToken(req.headers.authorization);
    if (token) {
      await posts.deleteSession(token);
    }
    res.status(204).send();
  });

  return app;
};
