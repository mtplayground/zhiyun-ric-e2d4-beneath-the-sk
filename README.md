# zhiyun-ric-e2d4-beneath-the-sk

Managed Creator playground.

## Static Deployment

The app builds to static files in `dist/` and can be served without Docker or a
Node runtime:

```bash
npm ci
npm run build:static
```

See [docs/self-hosting.md](docs/self-hosting.md) for environment variables,
asset path verification, and bare static-host deployment steps.
