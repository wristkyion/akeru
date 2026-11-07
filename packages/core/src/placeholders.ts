// Replaces {{char}} and {{user}} (any letter case, spaces allowed inside the braces).
// Unknown placeholders are left as they are.
export function fillPlaceholders(text: string, names: { char: string; user: string }): string {
  return text.replace(/\{\{\s*(char|user)\s*\}\}/gi, (_match, key: string) =>
    key.toLowerCase() === "char" ? names.char : names.user,
  );
}
