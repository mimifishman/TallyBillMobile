// TallyBill's own App Store page (Apple ID 6800714204).
export const APP_STORE_URL = "https://apps.apple.com/app/id6800714204";

// The app's custom URL scheme (app.json "scheme"). mobile://b/CODE opens the
// same screen as https://tallybill.app/b/CODE.
const APP_SCHEME = "mobile";

// A Universal Link never fires when you tap a link to the page you are already
// on, so "Open in App" has to use the custom scheme. If the app is installed,
// iOS switches to it and the page goes hidden. If the page is still visible a
// moment later, the app is not installed, so send the user to the App Store.
export function openBillInApp(joinCode: string) {
  let appOpened = false;
  const onHide = () => {
    if (document.hidden) appOpened = true;
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  window.location.href = `${APP_SCHEME}://b/${encodeURIComponent(joinCode)}`;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    if (!appOpened && !document.hidden) window.location.href = APP_STORE_URL;
  }, 1500);
}
