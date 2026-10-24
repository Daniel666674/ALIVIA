import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...next,
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "src/db/migrations/**"]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // SQL-injection guard: raw SQL must never be built from strings by hand.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='raw'][callee.object.name='sql']",
          message: "sql.raw() is forbidden: use parameterized queries (see docs/SECURITY.md).",
        },
        {
          selector: "CallExpression[callee.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is forbidden.",
        },
      ],
      "no-restricted-properties": [
        "error",
        { property: "dangerouslySetInnerHTML", message: "Forbidden (XSS)." },
      ],
    },
  },
]);
