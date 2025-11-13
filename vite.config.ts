import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts()],
  build: {
    target: 'es2024',
    lib: {
      entry: resolve(__dirname, 'src/connect.ts'),
      name: 'MetabenchOracleConnector',
      formats: ['es'],
      fileName: (format) => `metabench-oracle-connector.${format}.js`
    },
    rollupOptions: {
      external: ['ssh2', 'fs', 'path'],
      output: {
        globals: {
          'ssh2': 'ssh2'
        }
      }
    }
  }
});