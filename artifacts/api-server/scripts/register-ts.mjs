import { register } from "node:module";

// `import.meta.url` is already a file URL — passing it through pathToFileURL
// would double-encode it and the hooks file would not resolve.
register("./ts-resolve-hooks.mjs", import.meta.url);
