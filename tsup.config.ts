import { defineConfig } from 'tsup'

export default defineConfig([
  // Unminified
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    outDir: 'dist',
    target: 'es2020',
    minify: false,
  },
  // Minified
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: true,
    outDir: 'dist',
    target: 'es2020',
    minify: true,
    outExtension() {
      return { js: '.min.js', map: '.min.js.map' }
    },
  },
])
