import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.dependency-cruiser.cjs", "**/apps/shell/@mf-types/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        // typescript-eslint v8 project service 자동 탐지 비활성화.
        // apps/learn + apps/shell이 동시에 후보가 되어 파싱 에러 발생 방지.
        project: false,
        projectService: false,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
