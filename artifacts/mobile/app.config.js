// Development builds get their own identity so the dev app and the App Store
// app can sit side by side on one phone. Production is untouched: with
// APP_VARIANT unset this returns the static app.json config unchanged.
//
// The dev variant drops associatedDomains and intentFilters, because
// tallybill.app only vouches for the release bundle id — asking for them under
// a .dev id fails verification and needs extra Apple capabilities.

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) return config;

  const { associatedDomains, ...ios } = config.ios ?? {};
  const { intentFilters, ...android } = config.android ?? {};

  return {
    ...config,
    name: 'TallyBill Dev',
    ios: { ...ios, bundleIdentifier: `${ios.bundleIdentifier}.dev` },
    android: { ...android, package: `${android.package}.dev` },
  };
};
