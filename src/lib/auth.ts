const encoder = new TextEncoder();

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  // Pad or truncate the secret to ensure it is valid raw key material
  const keyData = encoder.encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Convert ArrayBuffer to base64url string
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Convert base64url string back to Uint8Array
function base64urlToBuffer(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function signSession(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
    
  const data = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const tokenInput = `${header}.${data}`;
  const key = await getCryptoKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(tokenInput)
  );
  
  const signature = bufferToBase64url(signatureBuffer);
  return `${tokenInput}.${signature}`;
}

export async function verifySession(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerStr, dataStr, signatureStr] = parts;
  const tokenInput = `${headerStr}.${dataStr}`;

  try {
    const key = await getCryptoKey(secret);
    const signatureBytes = base64urlToBuffer(signatureStr);
    
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as any,
      encoder.encode(tokenInput)
    );

    if (!isValid) return null;

    // Decode payload
    const decodedPayload = atob(
      dataStr.replace(/-/g, "+").replace(/_/g, "/")
    );
    const payload = JSON.parse(decodedPayload) as Record<string, unknown>;

    // Expiry check
    if (payload.exp && typeof payload.exp === "number") {
      if (Date.now() > payload.exp) {
        return null; // Expired
      }
    }

    return payload;
  } catch (err) {
    console.error("verifySession error:", err);
    return null;
  }
}
