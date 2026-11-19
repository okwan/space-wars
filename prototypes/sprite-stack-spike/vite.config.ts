// PROTOTYPE - NOT FOR PRODUCTION
// npm run proto:stack        -> dev server for this prototype
// npm run proto:stack:build  -> one self-contained HTML file in prototypes/sprite-stack-spike/dist/
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
});
