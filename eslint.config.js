import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.config.*"]
  },
  {
    // @office/shared is bundled by the server: no 3D, UI or DOM dependencies.
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "three", message: "packages/shared is bundled by the server; keep three in apps/web." },
          { name: "react", message: "packages/shared is bundled by the server; keep react in apps/web." },
          { name: "react-dom", message: "packages/shared is bundled by the server; keep react-dom in apps/web." },
        ],
        patterns: [
          { group: ["@react-three/*"], message: "packages/shared is bundled by the server; keep @react-three/* in apps/web." },
        ],
      }],
      "no-restricted-globals": ["error", "window", "document"],
    },
  }
);
