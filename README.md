# My Blog

A simple full-stack blog MVP built with React, Express, and TypeScript.

## Features

- View published posts
- Open a post detail view
- Create a new post
- Delete a post
- Express REST API with in-memory sample data

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

## Scripts

- `npm run dev` - run frontend and backend together
- `npm run build` - build both apps
- `npm start` - start the compiled backend
