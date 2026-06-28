# Black Relay Registry Site

Custom public explorer for `registry.blackrelay.network`.

This site consumes the public API at `api.blackrelay.network`. It does not store canonical data and does not duplicate Registry truth.

## Development

Install dependencies:
```sh
pnpm install
```

Windows:
```powershell
pnpm install
```

Run locally:
```sh
pnpm dev
```

Windows:
```powershell
pnpm dev
```

Run checks and build:
```sh
pnpm check
pnpm build
```

Windows:
```powershell
pnpm check
pnpm build
```

## Configuration

The client defaults to:
```text
https://api.blackrelay.network
```

Set `PUBLIC_REGISTRY_API_BASE` at build time to point at another compatible public API.

## Deployment

Build output is written to `dist` for Cloudflare Pages.
```sh
pnpm build
pnpm pages:deploy
```

Windows:
```powershell
pnpm build
pnpm pages:deploy
```
