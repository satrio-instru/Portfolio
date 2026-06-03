export function formatNumber(value) {
  if (value == null || isNaN(value)) return "-";
  return Number(value).toLocaleString("id-ID");
}

export function truncate(value, length = 40) {
  if (!value) return "";
  return value.length > length ? value.slice(0, length) + "…" : value;
}
