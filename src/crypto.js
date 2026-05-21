const STORAGE_KEY = "webds_enc_key";

async function getOrCreateKey() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const raw = JSON.parse(stored);
    return crypto.subtle.importKey(
      "raw",
      Uint8Array.from(raw),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Uint8Array(exported))));

  return key;
}

export async function encrypt(plaintext) {
  if (!plaintext) return "";
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return ivBase64 + ":" + ctBase64;
}

export async function decrypt(encoded) {
  if (!encoded || !encoded.includes(":")) return "";
  try {
    const key = await getOrCreateKey();
    const [ivBase64, ctBase64] = encoded.split(":");
    const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctBase64), (c) => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // decryption failed (e.g. key lost after clearing browser data)
    return "";
  }
}
