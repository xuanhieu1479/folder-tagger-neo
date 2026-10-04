# Folder Tagger Neo

A local, single-user Windows app for tagging folders on disk and searching them by tag. It replaces the old Electron app (`folder-tagger-electron`). `handoff.md` records the decisions behind the rewrite.

## Running it

Double-click `start.cmd`. It starts the server if needed and opens the app in its own Edge window at `http://127.0.0.1:4710`. The server stops a few seconds after the window is closed.

The first start builds the web app. After changing anything under `web/`, run `bun run build` again.

## Where the data lives

Everything is inside this folder, under `data/` (ignored by git):

| Path            | Contents                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data/app.db`   | The library (SQLite).                                                                                                                                                    |
| `data/backups/` | JSON exports. One is written at startup whenever the library changed since the last one. Clean-up and import logs (`-CLEARED.json`, `-IMPORT-FAILED.json`) also go here. |
| `data/logs/`    | Error logs, one file per day.                                                                                                                                            |

## Development

| Command          | What it does                                                                            |
| ---------------- | --------------------------------------------------------------------------------------- |
| `bun run seed`   | Builds a fake library: 300 folders in `data/dev-fixtures` and a database in `data/dev`. |
| `bun run dev`    | Runs the server and Vite against the fake library. Open `http://127.0.0.1:5173`.        |
| `bun test`       | Unit tests.                                                                             |
| `bun run check`  | Type checks (`tsc` for the server, `svelte-check` for the web app).                     |
| `bun run format` | Prettier.                                                                               |

Layout: `server/` is a Hono API on Bun with `bun:sqlite`; `web/` is a Svelte 5 single-page app with shadcn-svelte components. The web app imports the server's route types, so the API client is typed end to end. `server/src/shared/` holds code both sides use.

## Search

The (i) button in the search box lists the syntax. In short: plain words match the folder name or any tag; `author:`, `parody:`, `character:`, `genre:`, `category:` and `name:` narrow a word to one field; `-word` excludes; `"quoted"` matches a tag exactly; `no_`, `have_` and `many_` plus a tag type filter by how many tags of that type a folder has.

## Not done yet

- Importing the old app's data (its export format differs).
- Keyboard shortcuts beyond the arrow keys in the grid and the tag box.
