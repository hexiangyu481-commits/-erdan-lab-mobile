import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const CHUNK_BYTES = 23 * 1024 * 1024;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const [inputArg, outputArg, versionArg] = process.argv.slice(2);

if (!inputArg || !outputArg || !versionArg) {
  console.error("Usage: node scripts/pack-runtime.mjs <input.vrm|input.glb> <output-dir> <version>");
  process.exit(2);
}

const inputPath = resolve(inputArg);
const outputDir = resolve(outputArg);
const version = String(versionArg).trim();

if (!version) {
  console.error("Version must not be empty.");
  process.exit(2);
}

const source = await readFile(inputPath);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const chunks = [];
for (let offset = 0, index = 0; offset < source.length; offset += CHUNK_BYTES, index++) {
  const part = source.subarray(offset, Math.min(source.length, offset + CHUNK_BYTES));
  const file = `part-${String(index + 1).padStart(4, "0")}.bin`;
  await writeFile(join(outputDir, file), part);
  chunks.push({
    index,
    file,
    bytes: part.length,
    sha256: sha256(part)
  });
}

const manifest = {
  schema: "red-r-runtime-manifest/v1",
  version,
  sourceName: basename(inputPath),
  totalBytes: source.length,
  sha256: sha256(source),
  chunkBytes: CHUNK_BYTES,
  chunks,
  createdAt: new Date().toISOString()
};

await writeFile(
  join(outputDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify({
  ok: true,
  version,
  totalBytes: source.length,
  parts: chunks.length,
  outputDir
}, null, 2));
