import { createRequire } from "node:module";
import preferToString from "./rules/prefer-to-string.mjs";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

export default {
    meta: {
        name: packageJson.name,
        version: packageJson.version,
    },
    rules: {
        "prefer-to-string": preferToString,
    },
};
