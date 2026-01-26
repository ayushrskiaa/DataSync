


/**
 * Normalizes a value for consistent comparison.
 * Handles strings, numbers, booleans, dates, and null/undefined.
 */
export function normalizeValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object' && value instanceof Date) {
    // Check for valid date
    if (isNaN(value.getTime())) return '';
    return value.toISOString();
  }

  // Handle boolean as string
  if (typeof value === 'boolean') {
    return value.toString();
  }

  const str = String(value).trim();

  // Normalize booleans strings
  if (str.toLowerCase() === 'true') return 'true';
  if (str.toLowerCase() === 'false') return 'false';
  
  // Normalize numbers (e.g. "1.0" == "1")
  if (!isNaN(Number(str)) && str !== '') {
    return String(Number(str));
  }

  return str;
}

/**
 * Compares two values for equality using normalization.
 */
export function areValuesEqual(val1: any, val2: any): boolean {
  return normalizeValue(val1) === normalizeValue(val2);
}

/**
 * Compares two row objects to see if they are effectively the same.
 * Ignores keys that are not in the list of keys to compare (optional).
 */
export function areRowsEqual(
  row1: Record<string, any>, 
  row2: Record<string, any>, 
  keysToIgnore: Set<string> = new Set(['created_at', 'updated_at'])
): boolean {
  const keys1 = Object.keys(row1).filter(k => !keysToIgnore.has(k));
  const keys2 = Object.keys(row2).filter(k => !keysToIgnore.has(k));

  // Union of all keys
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    if (!areValuesEqual(row1[key], row2[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Deep cleans a row object for database insertion, removing undefined/nulls if needed
 * or converting them to appropriate defaults.
 */
export function cleanRowForDb(row: any, validColumns: string[]): Record<string, any> {
  const cleaned: Record<string, any> = {};
  const ignoredColumns = new Set(['created_at', 'updated_at']);

  for (const col of validColumns) {
    if (ignoredColumns.has(col)) continue;
    
    if (col in row) {
      let value = row[col];
      // Convert empty strings to null for DB if preferred, or keep as is.
      // SQL standard: empty string != null. But for sheets sync, we often treat them same.
      // Let's rely on standard logic: Empty cell -> null in DB (usually).
      if (value === '' || value === undefined) {
        value = null;
      }
      cleaned[col] = value;
    }
  }
  return cleaned;
}
