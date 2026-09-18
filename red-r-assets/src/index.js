const DEFAULT_ORIGIN = "https://hexiangyu481-commits.github.io";

function corsHeaders(origin, allowedOrigin) {
  const ok = origin && origin === allowedOrigin;
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "x-red-token, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function tokenFrom(request) {
  return request.headers.get("x-red-token") || "";
}

function tokenMatches(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") {
      if (origin && origin !== allowedOrigin) {
        return new Response(null, { status: 403, headers: cors });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        name: "red-r-assets",
        version: "0.1.0",
        storage: "workers-static-assets",
        protected: true
      }, 200, cors);
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      return json({ ok: false, error: "method_not_allowed" }, 405, cors);
    }

    if (origin && origin !== allowedOrigin) {
      return json({ ok: false, error: "origin_not_allowed" }, 403, cors);
    }

    if (!env.RED_ASSET_TOKEN) {
      return json({ ok: false, error: "asset_token_not_configured" }, 503, cors);
    }

    if (!tokenMatches(tokenFrom(request), env.RED_ASSET_TOKEN)) {
      return json({ ok: false, error: "unauthorized" }, 401, cors);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);

    for (const [k, v] of Object.entries(cors)) headers.set(k, v);

    if (assetResponse.ok) {
      if (url.pathname.includes("/private/")) {
        headers.set("cache-control", "private, max-age=31536000, immutable");
      } else {
        headers.set("cache-control", "private, max-age=300");
      }
      headers.set("x-content-type-options", "nosniff");
    }

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers
    });
  }
};
