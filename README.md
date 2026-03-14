# shipui

Install [ShipUI](https://voltenworks.com/shipui) components into your project. Base components are free. Premium theme styling requires a theme purchase.

## Quick Start

```bash
npx shipui add button
```

## Commands

### `npx shipui add <name>`

Install a base component (free, no auth required).

```bash
npx shipui add button
npx shipui add badge
npx shipui add card
```

### `npx shipui add <name> --theme <slug>`

Install a component with premium theme styling.

```bash
npx shipui add button --theme aloha
npx shipui add card --theme retro
```

Free themes (like Candy) don't require auth. Paid themes require a purchase token via `shipui login`.

### `npx shipui list`

List available components and themes.

```bash
npx shipui list
npx shipui list --theme aloha
npx shipui list --category ui
npx shipui list --free
```

### `npx shipui login`

Authenticate with your purchase token (from your purchase confirmation email).

```bash
npx shipui login
```

Tokens are stored in `~/.config/shipui/config.json` and persist across all projects.

### `npx shipui init`

Create a `shipui.json` config file for your project. Optional, sensible defaults are used without it.

```bash
npx shipui init
```

### `npx shipui info <name>`

Show component details, available themes, and install commands.

```bash
npx shipui info button
```

## Configuration

### `shipui.json` (optional)

```json
{
  "$schemaVersion": 1,
  "registry": "https://voltenworks.com/api/registry",
  "paths": {
    "components": "src/components",
    "lib": "src/lib",
    "css": "src/app/globals.css"
  },
  "importAlias": "@/"
}
```

Without a config file, the CLI auto-detects paths from your project structure.

## Flags

| Flag | Description |
|------|-------------|
| `--theme <slug>` | Apply theme styling |
| `--yes` | Skip all confirmation prompts |
| `--overwrite` | Overwrite existing files |
| `--dry-run` | Preview changes without writing |
| `--force` | Override theme conflict guard |
| `--token <token>` | Auth token (alternative to `shipui login`) |

## CSS Merging

When installing with a theme, the CLI appends theme tokens and component CSS to your `globals.css` using markers:

```css
/* shipui:theme:aloha:start */
@theme { ... }
/* shipui:theme:aloha:end */

/* shipui:component:aloha-button:start */
.btn-base { ... }
/* shipui:component:aloha-button:end */
```

One theme per project by default. Use `--force` to mix themes.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SHIPUI_TOKEN` | Auth token (overrides stored config) |

## License

MIT
