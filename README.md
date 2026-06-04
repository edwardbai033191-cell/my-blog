# My Blog

A simple full-stack blog MVP built with React, Express, and TypeScript.

## Features

- View published posts
- Open a post detail view
- Create a new post
- Delete a post
- User accounts, drafts, and admin moderation
- PostgreSQL persistence

## Getting Started

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.
The backend runs at `http://localhost:4000`.
The frontend runs at `http://localhost:8000`.

## Admin Account

Set these backend environment variables to create or promote an admin account:

```bash
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=choose-a-strong-password
```

Use separate credentials for staging and production.

## PostgreSQL

The backend requires a PostgreSQL connection string:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/my_blog
```

Set `DATABASE_SSL=true` when your PostgreSQL provider requires SSL.

Use separate databases for staging and production.

For Render:

1. Create a PostgreSQL database for the environment.
2. Set the backend service `DATABASE_URL` to its internal database URL.
3. Set `DATABASE_SSL=false` when using Render's internal URL.
4. Repeat with a separate PostgreSQL database for staging.

The previous SQLite file is not migrated automatically.

## Scripts

- `npm run dev` - run frontend and backend together
- `npm run build` - build both apps
- `npm start` - start the compiled backend
