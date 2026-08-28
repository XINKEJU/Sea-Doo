# Sea-Doo Jet Ski Showroom

React + Vite project (originally scaffolded in Figma Make).

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint (fonts, body, scrollbar)
- `src/api.ts` - API client for the seadoo-api backend (products/leads/settings, cookie session)
- `src/pages/Admin.tsx` - Management console (products / leads / site settings), lazy-loaded at `/admin`
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, lint, and formatting scripts
- `vite.config.ts` - Vite configuration with React and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain version for Node.js
- `deploy/` - Deployment tooling (`deploy.py`) targeting 170.168.89.127
- `server/` - Node.js CMS backend (Express, JSON store), deployed as the `seadoo-api` container

## Dependencies

- Runtime: React 19 and React DOM 19
- Routing: react-router 8
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Lint: ESLint (flat config) + typescript-eslint
- Formatting: oxfmt

## Styling

All component styling uses **inline `style` objects** (React `style={{...}}`) with a fixed palette: `#111111` (obsidian), `#F4F2EE` (beige), `#666666` (muted), `#FFFFFF` cards. There is **no Tailwind** — do not introduce utility classes; keep the inline-style convention so the visual language stays consistent.

Global styles (fonts, body defaults, scrollbar) live in `src/index.css`. `src/main.tsx` imports it; keep CSS `@import` statements first.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
- Run `npm run lint` and `npm run typecheck` before committing (CI enforces both).
