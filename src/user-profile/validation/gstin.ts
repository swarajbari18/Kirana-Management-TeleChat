const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function checksumChar(gstinWithoutCheck: string): string {
  let factor = 2;
  let sum = 0;
  const mod = 36;

  for (let i = gstinWithoutCheck.length - 1; i >= 0; i--) {
    let codePoint = GSTIN_CHARS.indexOf(gstinWithoutCheck[i]);
    if (codePoint < 0) {
      return "";
    }
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / mod) + (addend % mod);
    sum += addend;
  }

  const remainder = (mod - (sum % mod)) % mod;
  return GSTIN_CHARS[remainder];
}

export function isValidGstin(gstin: string): boolean {
  const normalized = gstin.trim().toUpperCase();
  if (normalized.length !== 15 || !GSTIN_PATTERN.test(normalized)) {
    return false;
  }
  const expected = checksumChar(normalized.slice(0, 14));
  return expected === normalized[14];
}

export function normalizeGstin(gstin: string): string {
  return gstin.trim().toUpperCase();
}
