// Future RED A8 integration helper. Not wired into production yet.
(function () {
  const TOKEN_KEY = "red.a8.server.token";

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  async function fetchProtected(url, token) {
    const response = await fetch(url, {
      headers: { "x-red-token": token },
      cache: "force-cache"
    });
    if (!response.ok) throw new Error(`R asset HTTP ${response.status}`);
    return response;
  }

  async function loadRuntime({ baseUrl, manifestPath }) {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    if (!token) throw new Error("RED_SHARED_TOKEN missing on this device");

    const root = baseUrl.replace(/\/+$/, "");
    const manifestUrl = root + "/" + manifestPath.replace(/^\/+/, "");
    const manifestResponse = await fetchProtected(manifestUrl, token);
    const manifest = await manifestResponse.json();

    if (manifest?.schema !== "red-r-runtime-manifest/v1" || !Array.isArray(manifest.chunks)) {
      throw new Error("Invalid R runtime manifest");
    }

    const buffers = new Array(manifest.chunks.length);
    let received = 0;

    for (let i = 0; i < manifest.chunks.length; i += 3) {
      const batch = manifest.chunks.slice(i, i + 3);
      await Promise.all(batch.map(async (chunk) => {
        const url = new URL(chunk.file, manifestUrl).href;
        const response = await fetchProtected(url, token);
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength !== chunk.bytes) throw new Error(`R asset size mismatch: ${chunk.file}`);
        const hash = await sha256Hex(buffer);
        if (hash !== chunk.sha256) throw new Error(`R asset hash mismatch: ${chunk.file}`);

        buffers[chunk.index] = new Uint8Array(buffer);
        received += buffer.byteLength;
      }));
    }

    if (received !== manifest.totalBytes) throw new Error("R asset total size mismatch");

    const merged = new Uint8Array(manifest.totalBytes);
    let offset = 0;
    for (const part of buffers) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    const wholeHash = await sha256Hex(merged.buffer);
    if (wholeHash !== manifest.sha256) throw new Error("R asset final hash mismatch");

    const blob = new Blob([merged], { type: "model/gltf-binary" });
    return {
      manifest,
      buffer: merged.buffer,
      objectUrl: URL.createObjectURL(blob)
    };
  }

  window.REDAssetLoader = { loadRuntime };
})();
