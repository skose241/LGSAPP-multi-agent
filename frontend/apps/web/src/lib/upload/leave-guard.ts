export const LEAVE_MESSAGE = "Yükleme sürüyor. Sayfadan ayrılırsanız yarım kalan yüklemeler iptal olur. Ayrılmak istiyor musunuz?";

export function shouldGuardNavigation(
  event: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  anchor: { href: string; target: string; hasAttribute: (name: string) => boolean } | null,
  current: { origin: string; pathname: string; search: string },
): boolean {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return false;
  let url: URL;
  try {
    url = new URL(anchor.href, current.origin);
  } catch {
    return false;
  }
  if (url.origin !== current.origin) return true;
  return url.pathname !== current.pathname || url.search !== current.search;
}

export const PASSWORDS_LEAVE_MESSAGE = "Tek seferlik şifreler bir daha gösterilmeyecek. Not almadan ayrılırsanız bu şifrelere ulaşamazsınız. Ayrılmak istiyor musunuz?";

export const DIRTY_LEAVE_MESSAGE = "Kaydedilmemiş değişiklikler var. Sayfadan ayrılırsanız kaybolur. Ayrılmak istiyor musunuz?";
