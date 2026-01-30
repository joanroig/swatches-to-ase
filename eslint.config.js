import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const tsFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const tsRecommended = tsPlugin.configs["flat/recommended"].find(
  (config) => config.name === "typescript-eslint/recommended",
);

export default [
  {
    ignores: ["node_modules", "build", "dist-web", "dist-electron", "release"],
  },
  js.configs.recommended,
  {
    files: tsFiles,
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
  },
  tsPlugin.configs["flat/eslint-recommended"],
  {
    files: tsFiles,
    rules: tsRecommended?.rules ?? {},
  },
];
