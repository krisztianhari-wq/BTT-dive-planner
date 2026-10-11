/**
 * Beágyazott build (pl. a sadrobot merülésnapló /terv/ modulja): a gazdaoldal címei és közös sütijei.
 * A Pages- és app-buildben a VITE_* értékek üresek, ilyenkor minden a tervező saját beállításaival működik.
 */
export const HOME_URL = (import.meta.env.VITE_HOME_URL as string | undefined) || undefined;
export const LOG_URL = (import.meta.env.VITE_LOG_URL as string | undefined) || undefined;

/** A gazdaoldal sütije (csak beágyazva). */
export function hostCookie(name: string): string | null {
  if (!HOME_URL) return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([a-z]+)`));
  return m ? m[1] : null;
}

/** A téma és a nyelv beágyazva a gazdaoldallal közös sütiben van, így a két modul mindig egyforma. */
export function setHostCookie(name: string, value: string): void {
  if (!HOME_URL) return;
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
}
