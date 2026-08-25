import fs from 'fs';
import path from 'path';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const copyFile = (src, destDir) => ({
  name: 'copy-file',
  writeBundle() {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, path.basename(src)));
  },
});

const TSC_OUT_DIR = 'node_modules/.cache/tsc';

const getTypescriptPlugin = (outDir) => typescript({
  include: ['**/*.ts', '**/*.tsx', '*.ts', '*.tsx'],
  compilerOptions: {
    outDir: outDir || TSC_OUT_DIR,
  },
});

const PRODUCTION_PLUGIN_CONFIG = {
  input: 'main.ts',
  output: {
    dir: '.',
    sourcemap: 'inline',
    sourcemapExcludeSources: true,
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    getTypescriptPlugin(),
    nodeResolve({ browser: true }),
    commonjs(),
  ]
};

const OUT_DIR = process.env.OUT_DIR || 'docs/test-vault/.obsidian/plugins/better-flashcards/';

const DEV_PLUGIN_CONFIG = {
  input: 'main.ts',
  output: {
    dir: OUT_DIR,
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    getTypescriptPlugin(OUT_DIR),
    nodeResolve({ browser: true }),
    commonjs(),
    copyFile('manifest.json', OUT_DIR),
  ]
};

let configs = []

if (process.env.BUILD === "dev") {
  configs.push(DEV_PLUGIN_CONFIG);
} else if (process.env.BUILD === "production") {
  configs.push(PRODUCTION_PLUGIN_CONFIG);
} else {
  configs.push(DEV_PLUGIN_CONFIG);
}

export default configs;
