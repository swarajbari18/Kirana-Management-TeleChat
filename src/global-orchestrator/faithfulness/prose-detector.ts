const GSTIN_PATTERN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i;
const PRODUCT_QUANTITY_PATTERN =
  /\b\d+\s*(packets?|units?|kg|g|liters?|l|boxes?|bottles?)\b/i;
const LABEL_VALUE_PATTERN =
  /\b(shop name|owner name|gstin|gst registered|gst|name|quantity|stock)\s*[:=]\s*\S+/i;

export function proseDetector(display: string): boolean {
  const text = display.trim();
  if (text.length === 0) {
    return false;
  }
  if (GSTIN_PATTERN.test(text)) {
    return true;
  }
  if (PRODUCT_QUANTITY_PATTERN.test(text)) {
    return true;
  }
  if (LABEL_VALUE_PATTERN.test(text)) {
    return true;
  }
  // Number that looks like a cited value (standalone digit sequence in factual context)
  if (/\b\d{2,}\b/.test(text) && /\b(stock|quantity|gstin|registered)\b/i.test(text)) {
    return true;
  }
  return false;
}
