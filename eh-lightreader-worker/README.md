# EH LightReader Cloudflare Worker — beta 1

This independent Worker does **not** modify or replace R's red-a8-mind Worker.

## Deploy using the existing Cloudflare account

[**Deploy independent EH LightReader Worker to Cloudflare**](https://deploy.workers.cloudflare.com/?url=https://github.com/hexiangyu481-commits/-erdan-lab-mobile/tree/main/eh-lightreader-worker)

- Select the same Cloudflare account as R, but choose a **new Worker** named eh-lightreader-api.
- Set EHLR_ACCESS_KEY to a newly generated random string of at least 20 characters. **Do not** reuse R's token or paste secrets into GitHub/ChatGPT.
- Test GET /health (public); then GET /api/status with Authorization: Bearer <your EHLR_ACCESS_KEY>.
- No paid subscription required for initial validation within Workers Free quotas.

## Routes

GET /health; authenticated: GET /api/status, /api/search?q=&cat=0&page=0, /api/gallery?gid=&token=, /api/catalog?gid=&token=&p=0, /api/image?url=<encoded E-Hentai image-page URL>.

The beta uses E-Hentai's public search pages and normal gallery metadata API only. It rejects access-denied and anti-bot challenge responses, does not use browser sessions, and never proxies images. Actual E-Hentai cloud access, image hotlink behavior, and iPhone standalone PWA experience remain unverified.

Never put EHLR_ACCESS_KEY in public frontend source. The beta UI requests the key on each browser session; it does not upload it to GitHub. Rate limiting and caching are per Worker isolate and do not guarantee global protection; the independent key is mandatory.
