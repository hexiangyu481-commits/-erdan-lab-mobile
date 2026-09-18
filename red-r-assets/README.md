# RED R Assets Worker

Isolated Cloudflare Workers Static Assets host for R's future 3D runtime body.

## Status

This project is deliberately **not wired into production RED A8 yet**.

It exists so R can use Cloudflare Workers Static Assets instead of R2 while R2 billing activation is unavailable.

Current production remains unchanged:

- RED A8 page: `red-mobile-a8-clean/`
- Mind Worker: `red-a8-mind`
- Production profile id: `migration-clean-v1`

## Security model

- All asset paths go through the Worker first.
- Requests require `x-red-token`.
- `RED_ASSET_TOKEN` is a Cloudflare secret and must never be committed.
- For the user's single-device setup, the intended value is the same secret already used as `RED_SHARED_TOKEN`; that lets the future loader reuse the token already stored locally by RED A8.
- CORS is restricted to `https://hexiangyu481-commits.github.io`.
- Raw source assets such as `Mona.blend` and the original Lapine package must stay private/local and must never be placed in this public Git repository.

## Static Asset constraints

Cloudflare Workers Static Assets currently limits each asset file to 25 MiB. This project uses a 23 MiB pack size to leave margin under that limit.

The final R runtime should still be optimized aggressively. Chunking is a transport fallback, not an excuse to ship an oversized mobile model.

## Pack a runtime locally

```bash
npm install
npm run pack -- /private/path/R_Master.vrm ./public/private/r-master-001 r-master-001
```

This produces:

- `manifest.json`
- `part-0001.bin`
- `part-0002.bin`
- ...

Each part and the full source have SHA-256 hashes in the manifest.

Generated files under `public/private/` are ignored by Git on purpose. Deploy them from the private/local working copy with Wrangler; do not push them to the public repository.

## Deploy

```bash
npm install
npx wrangler secret put RED_ASSET_TOKEN
npm run deploy
```

Then verify:

```text
https://red-r-assets.<account>.workers.dev/health
```

The health endpoint is public and contains no private asset information. Asset requests require the token.

## Future production integration

When R Master Body is ready:

1. Optimize the runtime body for mobile.
2. Pack it locally.
3. Deploy the private chunks through this Worker.
4. Verify manifest/chunk hashes on-device.
5. Only then wire `client/red-asset-loader.js` into RED A8.
6. Keep the old body path available for rollback until the 3D runtime passes acceptance.

No production RED file should be modified merely to create this asset host.
