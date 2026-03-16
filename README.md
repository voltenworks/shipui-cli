# @voltenworks/shipui

Install [ShipUI](https://voltenworks.com/shipui) components and starters into your Next.js project. Base components are free. Premium theme styling requires a theme purchase.

## Quick Start

```bash
# Create a new themed project from scratch
npx @voltenworks/shipui init --theme aloha

# Or add components to an existing Next.js project
npx @voltenworks/shipui add button
```

## Commands

### `init`

Create a new ShipUI project or set up an existing one.

**New project** (no `package.json` in current directory): scaffolds a full Next.js project with your chosen theme, including all pages, components, and styling.

```bash
npx @voltenworks/shipui init --theme aloha --yes
npx @voltenworks/shipui init --theme aloha --features auth --provider clerk --yes
npx @voltenworks/shipui init --theme aloha --features auth,dashboard --yes
```

**Existing project** (has `package.json` with Next.js): creates a `shipui.json` config file with your project paths and optional default theme.

```bash
npx @voltenworks/shipui init
npx @voltenworks/shipui init --theme folio --yes
```

| Flag | Description |
|------|-------------|
| `--theme <slug>` | Theme to scaffold (e.g. aloha, folio, retro) |
| `--features <items>` | Comma-separated starters to install (e.g. auth, dashboard) |
| `--provider <name>` | Auth provider (e.g. clerk) |
| `--registry <url>` | Registry URL override |
| `--token <token>` | Authentication token for paid themes |
| `--yes` | Use defaults without prompting |

### `add <name>`

Install a component or starter into your project.

```bash
# Base components (free, no auth)
npx @voltenworks/shipui add button
npx @voltenworks/shipui add badge
npx @voltenworks/shipui add card
npx @voltenworks/shipui add text

# With premium theme styling
npx @voltenworks/shipui add button --theme aloha
npx @voltenworks/shipui add card --theme retro

# Starters (multi-file feature scaffolds)
npx @voltenworks/shipui add auth --provider clerk --theme aloha
npx @voltenworks/shipui add dashboard --theme folio
```

Free themes don't require auth. Paid themes require a purchase token via `npx @voltenworks/shipui login`.

| Flag | Description |
|------|-------------|
| `--theme <slug>` | Apply theme styling |
| `--provider <name>` | Select starter provider (e.g. clerk) |
| `-y, --yes` | Skip all confirmation prompts |
| `--overwrite` | Overwrite existing files |
| `--dry-run` | Preview changes without writing files |
| `--force` | Override theme conflict guard |
| `--token <token>` | Auth token (alternative to login) |

### `list`

List available components, starters, and themes.

```bash
npx @voltenworks/shipui list
npx @voltenworks/shipui list --theme aloha
npx @voltenworks/shipui list --category ui
npx @voltenworks/shipui list --free
```

### `info <name>`

Show details about a component or starter, including available themes, pricing, and install commands.

```bash
npx @voltenworks/shipui info button
npx @voltenworks/shipui info auth
```

### `login`

Authenticate with your purchase token (from your purchase confirmation email).

```bash
npx @voltenworks/shipui login
npx @voltenworks/shipui login --token <token>
```

Tokens are stored globally at `~/.config/shipui/config.json` and persist across all projects.

### `doctor`

Diagnose your project setup for ShipUI compatibility. Checks Node version, Tailwind v4, PostCSS config, globals.css, auth tokens, registry connectivity, and dependencies.

```bash
npx @voltenworks/shipui doctor
```

## Configuration

### `shipui.json`

Created by `init` or automatically on first `add`. Stores project paths, default theme, and installed features.

```json
{
  "$schemaVersion": 2,
  "registry": "https://www.voltenworks.com/api/registry",
  "theme": "aloha",
  "projectType": "custom",
  "features": {
    "auth": { "included": true, "provider": "clerk", "providerInstalled": true },
    "dashboard": { "included": true }
  },
  "paths": {
    "components": "src/components",
    "lib": "src/lib",
    "css": "src/app/globals.css"
  },
  "importAlias": "@/"
}
```

Without a config file, the CLI auto-detects paths from your project structure.

### Theme resolution

When running `add`, the theme is resolved in this order:

1. `--theme <slug>` flag
2. `"theme"` field in `shipui.json`
3. Auto-detected from `/* shipui:theme:<slug>:start */` marker in `globals.css`

### Token resolution

Auth tokens are checked in this order:

1. `--token` flag
2. `SHIPUI_TOKEN` environment variable
3. Pro bundle token (`theme_pro`)
4. Theme bundle token (`theme_<slug>_bundle`)
5. Single theme token (`theme_<slug>`)

## Starters

Starters are multi-file feature scaffolds. They install pages, components, hooks, validation, and CSS.

### Auth starter

Login, signup, and forgot-password pages with form hooks, Zod validation, and an AuthForm component.

```bash
npx @voltenworks/shipui add auth --provider clerk
npx @voltenworks/shipui add auth --provider clerk --theme aloha
```

After installing, wrap your root layout with `ClerkProvider` and add your Clerk API keys to `.env.local`.

### Dashboard starter

Admin layout with sidebar, topbar, shell, overview page (stat cards, activity feed, checklist), and settings page.

```bash
npx @voltenworks/shipui add dashboard
npx @voltenworks/shipui add dashboard --theme folio
```

## CSS Merging

When installing with a theme, the CLI appends theme tokens and component CSS to your `globals.css` using markers:

```css
/* shipui:theme:aloha:start */
@theme { ... }
:root { --ui-accent: ...; }
/* shipui:theme:aloha:end */

/* shipui:component:aloha-button:start */
.btn-base { ... }
/* shipui:component:aloha-button:end */
```

One theme per project by default. Use `--force` to override.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SHIPUI_TOKEN` | Auth token (overrides stored config) |
| `SHIPUI_REGISTRY` | Registry URL override (used by `init`) |

## License

MIT
