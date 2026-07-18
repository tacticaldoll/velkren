import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "**/dist/**",
      ".agent/**",
      ".claude/**",
      ".codex/**",
      "eslint.config.js",
      "vitest.config.ts",
      "openspec/changes/archive/**",
    ],
  },
);
