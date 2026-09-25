import fs from "fs";
import path from "path";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const copyFile = (src, destDir) => ({
  name: "copy-file",
  writeBundle() {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, path.basename(src)));
  },
});

const getTypescriptPlugin = (outDir) =>
  typescript({
    include: ["**/*.ts", "**/*.tsx", "*.ts", "*.tsx"],
    compilerOptions: {
      outDir: outDir,
    },
  });

export default {
  input: "main.dev.ts",
  output: {
    dir: "docs/test-vault/.obsidian/plugins/better-flashcards/",
    entryFileNames: "main.js",
    sourcemap: "inline",
    format: "cjs",
    exports: "default",
  },
  external: ["obsidian"],
  plugins: [
    getTypescriptPlugin("docs/test-vault/.obsidian/plugins/better-flashcards/"),
    nodeResolve({ browser: true }),
    commonjs(),
    copyFile(
      "manifest.json",
      "docs/test-vault/.obsidian/plugins/better-flashcards/",
    ),
    copyFile(
      "styles.css",
      "docs/test-vault/.obsidian/plugins/better-flashcards/",
    ),
  ],
};
