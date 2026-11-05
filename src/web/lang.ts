/**
 * The sources answer in the language of the user's own content, so a block of it declares its own
 * language instead of inheriting the English chrome. Undefined keeps the document default.
 */
export function contentLang(text: string): string | undefined {
  const cyrillic = text.match(/[А-Яа-яЁё]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return cyrillic > latin ? 'ru' : undefined
}
