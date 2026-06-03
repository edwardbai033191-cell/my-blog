import { FormEvent, useEffect, useMemo, useState } from "react";

type PostStatus = "draft" | "published";

type Post = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
};

type DraftPost = {
  title: string;
  excerpt: string;
  content: string;
  author: string;
};

type View = "read" | "library" | "write";

const emptyDraft: DraftPost = {
  title: "",
  excerpt: "",
  content: "",
  author: ""
};

const apiRoot = window.location.port === "8000" ? "http://localhost:4000/api" : "/api";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedId) ?? posts[0],
    [posts, selectedId]
  );

  const publishedPosts = useMemo(
    () => posts.filter((post) => post.status === "published"),
    [posts]
  );

  const draftPosts = useMemo(() => posts.filter((post) => post.status === "draft"), [posts]);

  const previewPost: Post = {
    id: "preview",
    title: draft.title || "Untitled draft",
    excerpt: draft.excerpt || "Add a concise summary for the archive.",
    content: draft.content,
    author: draft.author || "Anonymous",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const loadPosts = async () => {
    try {
      setError(null);
      const response = await fetch(`${apiRoot}/posts`);

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
    void loadPosts();
  }, []);

  const handleChange = (field: keyof DraftPost, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const savePost = async (status: PostStatus) => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`${apiRoot}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
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
        method: "DELETE"
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("read")} type="button">
          <span>Field Notes</span>
          <small>{publishedPosts.length} published</small>
        </button>
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
        </nav>
      </header>

      {error ? <div className="banner">{error}</div> : null}

      {view === "read" ? (
        <section className="reader-page" aria-label="Reader">
          <aside className="rail" aria-label="Published posts">
            <div className="section-heading">
              <h2>Latest</h2>
              <span>{publishedPosts.length}</span>
            </div>
            {isLoading ? <p className="muted">Loading posts...</p> : null}
            <div className="post-buttons">
              {publishedPosts.map((post) => (
                <button
                  className={post.id === selectedPost?.id ? "post-button active" : "post-button"}
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
            {selectedPost ? (
              <>
                <div className="reader-header">
                  <div>
                    <p className="eyebrow">
                      {selectedPost.author} / {dateFormatter.format(new Date(selectedPost.updatedAt))}
                    </p>
                    <h1>{selectedPost.title}</h1>
                  </div>
                  <button className="ghost-button" onClick={() => void deletePost(selectedPost.id)} type="button">
                    Delete
                  </button>
                </div>
                <p className="excerpt">{selectedPost.excerpt}</p>
                <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPost.content) }} />
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
          </div>
          <div className="library-grid">
            {[...posts].map((post) => (
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
                  <button className="ghost-button" onClick={() => void deletePost(post.id)} type="button">
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!isLoading && posts.length === 0 ? <p className="muted">The archive is empty.</p> : null}
        </section>
      ) : null}

      {view === "write" ? (
        <section className="write-page" aria-label="Writing desk">
          <form className="editor" onSubmit={publishPost}>
            <div className="page-title compact">
              <p className="eyebrow">Writing Desk</p>
              <h1>Compose a post</h1>
            </div>
            <div className="field-row">
              <label>
                Title
                <input onChange={(event) => handleChange("title", event.target.value)} required value={draft.title} />
              </label>
              <label>
                Author
                <input onChange={(event) => handleChange("author", event.target.value)} placeholder="Anonymous" value={draft.author} />
              </label>
            </div>
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
      ) : null}
    </main>
  );
}

export default App;
