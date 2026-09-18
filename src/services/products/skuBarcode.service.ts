/**
 * SKU and Barcode Service for Retail Bookstore & Stationery
 * Supports EAN-13, EAN-8, Code-128 generation and format validation.
 */

/**
 * Calculates EAN-13 check digit using the modulo 10 algorithm.
 */
export function calculateEan13CheckDigit(twelveDigits: string): number {
  if (twelveDigits.length !== 12 || !/^\d+$/.test(twelveDigits)) {
    throw new Error('EAN-13 check digit requires exactly 12 numeric digits');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether a barcode string is a valid EAN-13, EAN-8, or generic alphanumeric barcode.
 */
export function isValidBarcode(barcode: string): { isValid: boolean; format: 'EAN13' | 'EAN8' | 'CODE128' | 'CUSTOM' | 'INVALID'; error?: string } {
  if (!barcode || barcode.trim() === '') {
    return { isValid: false, format: 'INVALID', error: 'الباركود لا يمكن أن يكون فارغاً' };
  }

  const clean = barcode.trim();

  // EAN-13 check
  if (/^\d{13}$/.test(clean)) {
    const checkDigit = calculateEan13CheckDigit(clean.slice(0, 12));
    if (parseInt(clean[12], 10) === checkDigit) {
      return { isValid: true, format: 'EAN13' };
    } else {
      return { isValid: false, format: 'INVALID', error: `الرقم التأكيدي للباركود EAN-13 غير صحيح (المتوقع ${checkDigit})` };
    }
  }

  // EAN-8 check
  if (/^\d{8}$/.test(clean)) {
    return { isValid: true, format: 'EAN8' };
  }

  // Code-128 / Standard alphanumeric (3-32 chars)
  if (/^[A-Za-z0-9\-_./]{3,32}$/.test(clean)) {
    return { isValid: true, format: 'CODE128' };
  }

  return { isValid: false, format: 'INVALID', error: 'صيغة الباركود تحتوي على حروف غير مقبولة' };
}

/**
 * Generates an internal retail EAN-13 barcode starting with prefix '20' (standard internal store prefix).
 */
export function generateInternalEan13Barcode(sequenceNum: number): string {
  const prefix = '200'; // Internal store prefix
  const seqStr = sequenceNum.toString().padStart(9, '0');
  const twelveDigits = (prefix + seqStr).slice(0, 12);
  const checkDigit = calculateEan13CheckDigit(twelveDigits);
  return `${twelveDigits}${checkDigit}`;
}

/**
 * Generates a clean, unique SKU based on category prefix and sequence number.
 * e.g. "BOK-00124", "PEN-00045"
 */
export function generateProductSku(prefix: string = 'PRD', sequenceNum: number): string {
  const cleanPrefix = (prefix || 'PRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const seq = sequenceNum.toString().padStart(5, '0');
  return `${cleanPrefix}-${seq}`;
}

/**
 * Generates a variant SKU based on parent SKU and attribute abbreviation.
 * e.g. "PEN-00045-BLU", "NB-00120-A4-100"
 */
export function generateVariantSku(parentSku: string, attributeValues: string[]): string {
  const cleanParent = parentSku.trim().toUpperCase();
  const attrParts = attributeValues
    .map(v => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))
    .filter(Boolean);
  
  if (attrParts.length === 0) {
    return `${cleanParent}-VAR`;
  }
  return `${cleanParent}-${attrParts.join('-')}`;
}
