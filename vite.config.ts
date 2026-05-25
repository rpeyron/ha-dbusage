import { defineConfig, type UserConfigExport } from 'vite';
import path from 'path';

const frontendConfig = defineConfig({
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/app/index.ts'),
      name: 'app',
      formats: ['es'],
      fileName: () => 'app.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
      },
    },
    target: 'es2020',
  },
  publicDir: false,
});

const backendConfig = defineConfig({
  build: {
    ssr: path.resolve(__dirname, 'src/server.ts'),
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        format: 'cjs',
      },
    },
    target: 'node20',
  },
  publicDir: false,
});

export default (({ mode }) => {
  return mode === 'backend' ? backendConfig : frontendConfig;
}) as UserConfigExport;
