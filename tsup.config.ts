import { defineConfig } from 'tsup'

const entries = ['src/index.ts', 'src/canvas.ts', 'src/dom.ts']

export default defineConfig([
  // Unminified
  {
    entry: entries,
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
    entry: entries,
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
