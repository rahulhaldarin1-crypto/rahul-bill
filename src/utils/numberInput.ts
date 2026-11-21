export function sanitizeNumericInput(
  raw: string,
  options: { allowDecimal?: boolean } = {}
): string {
  const { allowDecimal = true } = options;

  let cleaned = allowDecimal
    ? raw.replace(/[^\d.]/g, '')
    : raw.replace(/\D/g, '');

  if (allowDecimal) {
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex !== -1) {
      cleaned =
        cleaned.slice(0, dotIndex + 1) +
        cleaned.slice(dotIndex + 1).replace(/\./g, '');
    }
  }

  // Strip redundant leading zeros before another digit (e.g. "05" -> "5", "00.5" -> "0.5")
  return cleaned.replace(/^0+(?=\d)/, '');
}

export function formatNumericFieldValue(
  value: number | '' | undefined | null,
  options: { showZero?: boolean } = {}
): string {
  if (value === '' || value === undefined || value === null) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (!options.showZero && num === 0) return '';
  return String(num);
}
