import { FormEvent, useEffect, useMemo, useState } from "react";

type PostStatus = "draft" | "published";

type Post = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  userId: string | null;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
};

type DraftPost = {
  title: string;
  excerpt: string;
  content: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
};

type View = "read" | "library" | "write" | "account" | "admin";
type AuthMode = "login" | "register";

const emptyDraft: DraftPost = {
  title: "",
  excerpt: "",
  content: ""
};

const configuredApiRoot = process.env.API_URL;
const apiRoot =
  configuredApiRoot ||
  (window.location.port === "8000" ? "http://localhost:4000/api" : "/api");

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderInline = (value: string) =>
  escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noreferrer" target="_blank">$1</a>');

const renderMarkdown = (markdown: string) => {
  const blocks = markdown.trim().split(/\n{2,}/);

  if (!markdown.trim()) {
    return "<p>Start writing to see the preview.</p>";
  }

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = block.match(/^(#{1,3})\s+(.+)$/);

      if (heading) {
        const level = heading[1].length + 1;
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }

      if (lines.every((line) => /^-\s+/.test(line))) {
        return `<ul>${lines
          .map((line) => `<li>${renderInline(line.replace(/^-\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }

      if (lines.every((line) => /^>\s?/.test(line))) {
        return `<blockquote>${renderInline(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}</blockquote>`;
      }

      return `<p>${lines.map(renderInline).join("<br />")}</p>`;
    })
    .join("");
};

function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPost>({
    ...emptyDraft,
    content: "## Untitled idea\n\nStart with the shape of the piece.\n\n- Key point\n- Supporting detail\n- Closing note"
  });
  const [view, setView] = useState<View>("read");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem("blog-token") ?? "");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminPosts, setAdminPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishedPosts = useMemo(
    () => posts.filter((post) => post.status === "published"),
    [posts]
  );

  const draftPosts = useMemo(() => posts.filter((post) => post.status === "draft"), [posts]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchesSearch = (post: Post) => {
    if (!normalizedSearch) {
      return true;
    }

    return [post.title, post.excerpt, post.content, post.author, post.status]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  };

  const filteredPosts = useMemo(
    () => posts.filter(matchesSearch),
    [posts, normalizedSearch]
  );

  const filteredPublishedPosts = useMemo(
    () => publishedPosts.filter(matchesSearch),
    [publishedPosts, normalizedSearch]
  );

  const readerPost = useMemo(
    () =>
      filteredPublishedPosts.find((post) => post.id === selectedId) ??
      filteredPublishedPosts[0] ??
      null,
    [filteredPublishedPosts, selectedId]
  );

  const previewPost: Post = {
    id: "preview",
    title: draft.title || "Untitled draft",
    excerpt: draft.excerpt || "Add a concise summary for the archive.",
    content: draft.content,
    userId: user?.id ?? null,
    author: user?.name || "Your name",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const authHeaders = (authToken = token): Record<string, string> =>
    authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const loadPosts = async (authToken = token) => {
    try {
      setError(null);
      const response = await fetch(`${apiRoot}/posts`, {
        headers: authHeaders(authToken)
      });

      if (!response.ok) {
        throw new Error("Unable to load posts");
      }

      const data = (await response.json()) as Post[];
      setPosts(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      if (!token) {
        await loadPosts("");
        return;
      }

      const response = await fetch(`${apiRoot}/auth/me`, {
        headers: authHeaders(token)
      });

      if (response.ok) {
        const body = (await response.json()) as { user: User };
        setUser(body.user);
        await loadPosts(token);
        return;
      }

      localStorage.removeItem("blog-token");
      setToken("");
      await loadPosts("");
    };

    void restoreSession();
  }, []);

  const handleChange = (field: keyof DraftPost, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const savePost = async (status: PostStatus) => {
    if (!user) {
      setView("account");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`${apiRoot}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ ...draft, status })
      });

      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "Unable to save post");
      }

      const post = (await response.json()) as Post;
      setPosts((current) => [post, ...current]);
      setSelectedId(post.id);
      setDraft(emptyDraft);
      setView(status === "published" ? "read" : "library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const publishPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void savePost("published");
  };

  const deletePost = async (postId: string) => {
    setError(null);

    try {
      const response = await fetch(`${apiRoot}/posts/${postId}`, {
        method: "DELETE",
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("Unable to delete post");
      }

      setPosts((current) => current.filter((post) => post.id !== postId));
      setSelectedId((current) => (current === postId ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const openPost = (postId: string) => {
    setSelectedId(postId);
    setView("read");
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${apiRoot}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const body = (await response.json()) as {
        user?: User;
        token?: string;
        message?: string;
      };

      if (!response.ok || !body.user || !body.token) {
        throw new Error(body.message ?? "Unable to sign in");
      }

      localStorage.setItem("blog-token", body.token);
      setToken(body.token);
      setUser(body.user);
      await loadPosts(body.token);
      setView("write");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const logout = async () => {
    await fetch(`${apiRoot}/auth/logout`, {
      method: "POST",
      headers: authHeaders()
    });
    localStorage.removeItem("blog-token");
    setToken("");
    setUser(null);
    await loadPosts("");
    setView("read");
  };

  const loadAdmin = async () => {
    setError(null);

    try {
      const response = await fetch(`${apiRoot}/admin/overview`, {
        headers: authHeaders()
      });
      const body = (await response.json()) as {
        users?: User[];
        posts?: Post[];
        message?: string;
      };

      if (!response.ok || !body.users || !body.posts) {
        throw new Error(body.message ?? "Unable to load admin dashboard");
      }

      setAdminUsers(body.users);
      setAdminPosts(body.posts);
      setView("admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const adminDeletePost = async (postId: string) => {
    const response = await fetch(`${apiRoot}/admin/posts/${postId}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    if (!response.ok) {
      setError("Unable to moderate post");
      return;
    }

    setAdminPosts((current) => current.filter((post) => post.id !== postId));
    setPosts((current) => current.filter((post) => post.id !== postId));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("read")} type="button">
          <span>Field Notes</span>
          <small>{publishedPosts.length} published</small>
        </button>
        <label className="search-field" aria-label="Search posts">
          <span>Search</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search posts"
            type="search"
            value={searchQuery}
          />
        </label>
        <nav aria-label="Primary">
          <button className={view === "read" ? "nav-button active" : "nav-button"} onClick={() => setView("read")} type="button">
            Reader
          </button>
          <button className={view === "library" ? "nav-button active" : "nav-button"} onClick={() => setView("library")} type="button">
            Library
          </button>
          <button className={view === "write" ? "nav-button active" : "nav-button"} onClick={() => setView("write")} type="button">
            Write
          </button>
          <button className={view === "account" ? "nav-button active" : "nav-button"} onClick={() => setView("account")} type="button">
            {user ? user.name : "Sign in"}
          </button>
          {user?.role === "admin" ? (
            <button className={view === "admin" ? "nav-button active" : "nav-button"} onClick={() => void loadAdmin()} type="button">
              Admin
            </button>
          ) : null}
        </nav>
      </header>

      {error ? <div className="banner">{error}</div> : null}

      {view === "read" ? (
        <section className="reader-page" aria-label="Reader">
          <aside className="rail" aria-label="Published posts">
            <div className="section-heading">
              <h2>{normalizedSearch ? "Results" : "Latest"}</h2>
              <span>{filteredPublishedPosts.length}</span>
            </div>
            {isLoading ? <p className="muted">Loading posts...</p> : null}
            {!isLoading && filteredPublishedPosts.length === 0 ? (
              <p className="muted">No published posts match your search.</p>
            ) : null}
            <div className="post-buttons">
              {filteredPublishedPosts.map((post) => (
                <button
                  className={post.id === readerPost?.id ? "post-button active" : "post-button"}
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  type="button"
                >
                  <strong>{post.title}</strong>
                  <span>{post.excerpt}</span>
                </button>
              ))}
            </div>
          </aside>

          <article className="reader">
            {readerPost ? (
              <>
                <div className="reader-header">
                  <div>
                    <p className="eyebrow">
                      {readerPost.author} / {dateFormatter.format(new Date(readerPost.updatedAt))}
                    </p>
                    <h1>{readerPost.title}</h1>
                  </div>
                  {user?.id === readerPost.userId ? (
                    <button className="ghost-button" onClick={() => void deletePost(readerPost.id)} type="button">
                      Delete
                    </button>
                  ) : null}
                </div>
                <p className="excerpt">{readerPost.excerpt}</p>
                <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(readerPost.content) }} />
              </>
            ) : (
              <p className="muted">No posts yet.</p>
            )}
          </article>
        </section>
      ) : null}

      {view === "library" ? (
        <section className="library-page" aria-label="Library">
          <div className="page-title">
            <p className="eyebrow">Archive</p>
            <h1>Manage the collection</h1>
            <p className="page-summary">
              {normalizedSearch
                ? `${filteredPosts.length} matching posts across ${posts.length} total`
                : `${publishedPosts.length} published and ${draftPosts.length} drafts`}
            </p>
          </div>
          <div className="library-grid">
            {[...filteredPosts].map((post) => (
              <article className="post-card" key={post.id}>
                <div>
                  <span className={post.status === "draft" ? "status draft" : "status"}>{post.status}</span>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt}</p>
                </div>
                <div className="card-actions">
                  <button className="secondary-button" onClick={() => openPost(post.id)} type="button">
                    Open
                  </button>
                  {user?.id === post.userId ? (
                    <button className="ghost-button" onClick={() => void deletePost(post.id)} type="button">
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {!isLoading && posts.length === 0 ? <p className="muted">The archive is empty.</p> : null}
          {!isLoading && posts.length > 0 && filteredPosts.length === 0 ? (
            <p className="muted">No posts match your search.</p>
          ) : null}
        </section>
      ) : null}

      {view === "write" ? (
        user ? (
        <section className="write-page" aria-label="Writing desk">
          <form className="editor" onSubmit={publishPost}>
            <div className="page-title compact">
              <p className="eyebrow">Writing Desk</p>
              <h1>Compose a post</h1>
            </div>
            <label>
              Title
              <input onChange={(event) => handleChange("title", event.target.value)} required value={draft.title} />
            </label>
            <label>
              Excerpt
              <input onChange={(event) => handleChange("excerpt", event.target.value)} required value={draft.excerpt} />
            </label>
            <label>
              Markdown
              <textarea onChange={(event) => handleChange("content", event.target.value)} required rows={18} value={draft.content} />
            </label>
            <div className="editor-actions">
              <button className="secondary-button" disabled={isSaving} onClick={() => void savePost("draft")} type="button">
                Save Draft
              </button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Publishing..." : "Publish"}
              </button>
            </div>
          </form>

          <article className="preview">
            <p className="eyebrow">{previewPost.author} / Preview</p>
            <h1>{previewPost.title}</h1>
            <p className="excerpt">{previewPost.excerpt}</p>
            <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(previewPost.content) }} />
          </article>
        </section>
        ) : (
          <section className="account-page">
            <div className="account-callout">
              <p className="eyebrow">Writing Desk</p>
              <h1>Sign in to start writing</h1>
              <button className="primary-button" onClick={() => setView("account")} type="button">
                Open account
              </button>
            </div>
          </section>
        )
      ) : null}

      {view === "account" ? (
        <section className="account-page" aria-label="Account">
          {user ? (
            <div className="account-callout">
              <p className="eyebrow">Account</p>
              <h1>{user.name}</h1>
              <p className="page-summary">{user.email} / {user.role}</p>
              <button className="secondary-button" onClick={() => void logout()} type="button">
                Sign out
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submitAuth}>
              <div className="page-title compact">
                <p className="eyebrow">Account</p>
                <h1>{authMode === "login" ? "Welcome back" : "Join the journal"}</h1>
              </div>
              {authMode === "register" ? (
                <label>
                  Name
                  <input
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={authForm.name}
                  />
                </label>
              ) : null}
              <label>
                Email
                <input
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  required
                  type="email"
                  value={authForm.email}
                />
              </label>
              <label>
                Password
                <input
                  minLength={8}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  required
                  type="password"
                  value={authForm.password}
                />
              </label>
              <button className="primary-button" type="submit">
                {authMode === "login" ? "Sign in" : "Create account"}
              </button>
              <button
                className="text-button"
                onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
                type="button"
              >
                {authMode === "login" ? "Create an account" : "Use an existing account"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {view === "admin" && user?.role === "admin" ? (
        <section className="admin-page" aria-label="Admin dashboard">
          <div className="page-title">
            <p className="eyebrow">Administration</p>
            <h1>Site overview</h1>
            <p className="page-summary">
              {adminUsers.length} users and {adminPosts.length} posts
            </p>
          </div>

          <section className="admin-section">
            <div className="section-heading">
              <h2>Users</h2>
              <span>{adminUsers.length}</span>
            </div>
            <div className="admin-list">
              {adminUsers.map((account) => (
                <div className="admin-row" key={account.id}>
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.email}</span>
                  </div>
                  <span className={account.role === "admin" ? "status draft" : "status"}>
                    {account.role}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <div className="section-heading">
              <h2>Posts</h2>
              <span>{adminPosts.length}</span>
            </div>
            <div className="admin-list">
              {adminPosts.map((post) => (
                <div className="admin-row" key={post.id}>
                  <div>
                    <strong>{post.title}</strong>
                    <span>{post.author} / {post.status}</span>
                  </div>
                  <button className="ghost-button" onClick={() => void adminDeletePost(post.id)} type="button">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

export default App;
