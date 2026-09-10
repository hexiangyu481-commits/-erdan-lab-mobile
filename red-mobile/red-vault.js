// RED PROTOCOL portable encrypted vault
// Browser-only WebCrypto. No network access.

const RED_VAULT_MAGIC = 'REDVAULT';
const RED_VAULT_VERSION = 1;
const RED_VAULT_KDF_ITERATIONS = 250000;

function rvBytesToBase64(bytes) {
  let s = '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function rvBase64ToBytes(s) {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function rvDeriveKey(passphrase, salt, iterations = RED_VAULT_KDF_ITERATIONS) {
  if (!window.crypto?.subtle) throw new Error('当前浏览器不支持 WebCrypto');
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function makeRedPortableSnapshot(S, extra = {}) {
  return {
    schemaVersion: 1,
    appVersion: '0.3',
    exportedAt: new Date().toISOString(),
    // Identity / role configuration
    profile: S?.profile ?? null,
    // Current relationship state
    state: S?.state ?? { trust: 50, control: 35, stress: 18 },
    // Conversation continuity
    history: Array.isArray(S?.history) ? S.history : [],
    memory: typeof S?.memory === 'string' ? S.memory : '',
    memoryItems: Array.isArray(S?.memoryItems) ? S.memoryItems : [],
    // Public/reference knowledge imported by the user
    references: Array.isArray(S?.references) ? S.references : [],
    // Local app settings only. Model cache/weights are intentionally excluded.
    settings: S?.settings ?? {},
    ...extra
  };
}

function validateRedPortableSnapshot(x) {
  if (!x || typeof x !== 'object') throw new Error('档案内容无效');
  if (Number(x.schemaVersion) !== 1) throw new Error('不支持的 RED 档案版本');
  if (x.history && !Array.isArray(x.history)) throw new Error('聊天历史格式损坏');
  if (x.memoryItems && !Array.isArray(x.memoryItems)) throw new Error('长期记忆格式损坏');
  if (x.references && !Array.isArray(x.references)) throw new Error('参考档案格式损坏');
  return x;
}

async function createRedVault(snapshot, passphrase) {
  if (!passphrase || passphrase.length < 6) throw new Error('迁移密码至少 6 位；更长会更安全');
  validateRedPortableSnapshot(snapshot);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await rvDeriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const aad = new TextEncoder().encode(`${RED_VAULT_MAGIC}:${RED_VAULT_VERSION}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad }, key, plaintext
  );

  return JSON.stringify({
    magic: RED_VAULT_MAGIC,
    version: RED_VAULT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: RED_VAULT_KDF_ITERATIONS,
      salt: rvBytesToBase64(salt)
    },
    cipher: {
      name: 'AES-GCM',
      iv: rvBytesToBase64(iv)
    },
    payload: rvBytesToBase64(new Uint8Array(ciphertext))
  });
}

async function openRedVault(vaultText, passphrase) {
  let box;
  try { box = JSON.parse(vaultText); }
  catch { throw new Error('这不是有效的 RED 迁移包'); }

  if (box?.magic !== RED_VAULT_MAGIC || Number(box?.version) !== RED_VAULT_VERSION) {
    throw new Error('无法识别这个 RED 迁移包');
  }
  if (!passphrase) throw new Error('需要迁移密码');

  const salt = rvBase64ToBytes(box.kdf?.salt || '');
  const iv = rvBase64ToBytes(box.cipher?.iv || '');
  const ciphertext = rvBase64ToBytes(box.payload || '');
  const iterations = Number(box.kdf?.iterations) || RED_VAULT_KDF_ITERATIONS;
  const key = await rvDeriveKey(passphrase, salt, iterations);
  const aad = new TextEncoder().encode(`${RED_VAULT_MAGIC}:${RED_VAULT_VERSION}`);

  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad }, key, ciphertext
    );
  } catch {
    throw new Error('迁移密码错误，或档案已损坏');
  }

  const snapshot = JSON.parse(new TextDecoder().decode(plaintext));
  return validateRedPortableSnapshot(snapshot);
}

async function downloadRedVault(S, passphrase) {
  const snapshot = makeRedPortableSnapshot(S);
  const text = await createRedVault(snapshot, passphrase);
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `RED_${stamp}.redvault`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function readRedVaultFile(file, passphrase) {
  if (!file) throw new Error('没有选择档案');
  if (file.size > 50 * 1024 * 1024) throw new Error('迁移包异常过大');
  return openRedVault(await file.text(), passphrase);
}
