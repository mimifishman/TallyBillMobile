const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force singleton resolution for packages that must appear exactly once in
// the bundle. In this pnpm monorepo, workspace libs (e.g.
// @workspace/api-client-react) can have their @tanstack/react-query dep
// peer-resolved against the WEB catalog react (19.1.9), which would drag a
// second copy of react into the mobile bundle. React Native 0.81's renderer
// requires react to be EXACTLY 19.1.0 at runtime ("Incompatible React
// versions" red screen in Expo Go otherwise), and react-query's context
// breaks if two instances are bundled. Redirecting these imports to the
// mobile app's own node_modules guarantees one copy of each, resolved
// against the app's pinned react 19.1.0 (see the `mobile` named catalog in
// pnpm-workspace.yaml).
const SINGLETON_PACKAGES = ["react", "react-dom", "@tanstack/react-query"];

// A fake origin inside the app dir so node_modules lookup starts at
// artifacts/mobile/node_modules.
const APP_ORIGIN = path.join(__dirname, "package.json");

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = SINGLETON_PACKAGES.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  if (isSingleton && context.originModulePath !== APP_ORIGIN) {
    return context.resolveRequest(
      { ...context, originModulePath: APP_ORIGIN },
      moduleName,
      platform,
    );
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
