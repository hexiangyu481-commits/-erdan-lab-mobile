# EH LightReader Cloud pilot (isolated from R)

This Worker contains a **separate copy** of the released EH LightReader static assets in `public/`. The original GitHub Pages project stays unchanged. It has its own Worker name `eh-lightreader-cloud` and does not modify `red-a8-mind` or any R secrets or KV.

## Deploy using existing Cloudflare account

On Cloudflare Workers & Pages, create a **new** Worker with GitHub repository `hexiangyu481-commits/-erdan-lab-mobile`; root directory `eh-lightreader-cloud`, production branch `main`, build command `npx wrangler deploy`. Do not attach this folder to the existing red-a8-mind Worker. Set the Worker name to `eh-lightreader-cloud`.

After deployment, open `https://eh-lightreader-cloud.<your-subdomain>.workers.dev/api/health` and ensure `ok=true`. Then use the Worker root for the pilot PWA.

## Boundaries

- Public discovery and gallery metadata are experimental; actual E-Hentai access from Workers egress is NOT VERIFIED.
- If E-Hentai blocks access or requires a login/challenge, stop. No login bypass, cookie collection, proxy rotation, or retry on 403/429.
- Do not add user account secrets to GitHub.
- This experiment does not upload R user data or change RED A8 routes.
- iPhone Safari/real manga image delivery has NOT been tested; existing Userscripts remains fallback.

## APIs

`GET /api/health`, `GET /api/search?q=...`, `GET /api/gallery?gid=...&token=...`, `GET /api/catalog?gid=...&token=...&p=0`, `GET /api/page?url=...`.

One-click Cloudflare import (creates a separate Worker project):

https://deploy.workers.cloudflare.com/?url=https://github.com/hexiangyu481-commits/-erdan-lab-mobile/tree/main/eh-lightreader-cloud

This button may create a new GitHub repository copy. To keep using the original repository instead, import the existing repository from Workers & Pages and set its root directory to `eh-lightreader-cloud`.
