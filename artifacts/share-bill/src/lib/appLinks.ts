// TallyBill's own App Store page (Apple ID 6800714204).
export const APP_STORE_URL = "https://apps.apple.com/app/id6800714204";

// TallyBill's Google Play page (package app.tallybill).
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.tallybill";

// The app's custom URL scheme (app.json "scheme"). mobile://b/CODE opens the
// same screen as https://tallybill.app/b/CODE.
const APP_SCHEME = "mobile";
const ANDROID_PACKAGE = "app.tallybill";

export const isAndroid =
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

// The store this device installs from. Laptops get the App Store, as before.
export const STORE_URL = isAndroid ? PLAY_STORE_URL : APP_STORE_URL;

// A Universal Link never fires when you tap a link to the page you are already
// on, so "Open in App" has to use the custom scheme. If the app is installed,
// iOS switches to it and the page goes hidden. If the page is still visible a
// moment later, the app is not installed, so send the user to the App Store.
//
// Android Chrome ignores an unknown scheme, so there we use an intent URL:
// Android opens the app if it is installed, and otherwise goes to the
// fallback URL, the Play Store page.
export function openBillInApp(joinCode: string) {
  const path = `b/${encodeURIComponent(joinCode)}`;

  if (isAndroid) {
    window.location.href =
      `intent://${path}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
    return;
  }

  let appOpened = false;
  const onHide = () => {
    if (document.hidden) appOpened = true;
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  window.location.href = `${APP_SCHEME}://${path}`;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    if (!appOpened && !document.hidden) window.location.href = APP_STORE_URL;
  }, 1500);
}
