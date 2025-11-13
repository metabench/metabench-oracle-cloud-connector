# Setting Up Vite in metabench-oracle-cloud-connector

This guide provides a detailed walkthrough for integrating Vite into the metabench-oracle-cloud-connector project. Vite is a fast build tool that provides a development server with hot module replacement (HMR) and optimized production builds, making it ideal for modern web development workflows.

## Prerequisites

Before setting up Vite, ensure you have the following:

- **Node.js**: Version 18 or higher (as required by the project). Verify with `node --version`.
- **npm**: Comes bundled with Node.js. Check with `npm --version`.
- **Basic understanding**: Familiarity with TypeScript, as the project uses `.ts` files.

## Why Vite?

Vite offers several advantages over traditional bundlers like Webpack:

- **Lightning-fast cold start**: Uses native ES modules in development.
- **Instant HMR**: Updates modules without full page reloads.
- **Optimized builds**: Leverages Rollup for production with tree-shaking and code splitting.
- **Plugin ecosystem**: Extensive plugins for various frameworks and tools.

For this project, Vite can replace or complement the existing jsgui3-based build process, especially if you're adding web-based demos or UIs that interact with the Oracle SSH connector.

## Step 1: Install Vite and Dependencies

First, navigate to the project root and install Vite as a dev dependency:

```bash
npm install --save-dev vite @vitejs/plugin-vue
```

- `vite`: The core build tool.
- `@vitejs/plugin-vue`: If you're using Vue.js (optional; adjust based on your needs).

Since this project uses TypeScript, also install the TypeScript plugin:

```bash
npm install --save-dev @vitejs/plugin-vue-typescript
```

If you're building a library (like the SSH connector), consider:

```bash
npm install --save-dev vite-plugin-dts
```

This generates TypeScript declaration files for your library builds.

## Step 2: Create Vite Configuration

Create a `vite.config.ts` file in the project root. Here's a basic configuration tailored for this project:

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2024',
    lib: {
      entry: resolve(__dirname, 'connect.ts'), // Main library file; adjust if restructured
      name: 'MetabenchOracleConnector',
      fileName: (format) => `metabench-oracle-connector.${format}.js`
    },
    rollupOptions: {
      external: ['ssh2', 'fs', 'path'], // Externalize Node.js built-ins and ssh2
      output: {
        globals: {
          'ssh2': 'ssh2'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src') // Optional: Set up path aliases
    }
  }
});
```

### Key Configuration Notes

- **Library Mode**: Since this is a connector library, use `build.lib` to output a library bundle.
- **Externals**: Keep `ssh2` and Node.js modules external to avoid bundling them.
- **Entry Point**: Point to your main TypeScript file (e.g., `connect.ts` or a new `src/index.ts`).
- **Plugins**: Add Vue plugin if you're creating web components; otherwise, use vanilla TypeScript.

If you're setting up for a web app instead of a library, remove the `build.lib` section and adjust accordingly.

## Step 3: Update package.json Scripts

Add Vite scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  }
}
```

- `dev`: Starts the development server.
- `build`: Builds for production.
- `preview`: Previews the built app locally.
- `type-check`: Runs TypeScript type checking (complements the existing ad-hoc check).

## Step 4: Set Up Project Structure

For a library build (recommended for this connector), you don't need to restructure your existing files. Vite can use your current `connect.ts` as the entry point. If you prefer to organize into a `src/` folder later, you can move files and update the config.

If adding web components or demos:

```
metabench-oracle-cloud-connector/
├── src/                 # Optional: For new web-related code
│   ├── components/      # Vue/React components (if applicable)
│   └── utils/           # Utility functions
├── public/              # Static assets (if needed)
├── index.html           # HTML entry (only for web apps)
├── connect.ts           # Your existing library entry
└── vite.config.ts       # Vite config
```

For pure library builds, `index.html` and `public/` are unnecessary.

## Step 5: Configure TypeScript (if needed)

If you don't have a `tsconfig.json`, create one:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM"],
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve"
  },
  "include": ["*.ts", "vite.config.ts"]
}
```

This ensures TypeScript works well with Vite's module resolution.

## Step 6: Development Workflow

### Starting the Dev Server

Run the development server:

```bash
npm run dev
```

This starts Vite's dev server, typically on `http://localhost:5173`. It supports HMR for instant updates.

### Building for Production

Create an optimized build:

```bash
npm run build
```

Output goes to `dist/` by default. For libraries, this produces the bundled JS and TypeScript declarations.

### Previewing Builds

Test the production build locally:

```bash
npm run preview
```

## Step 7: Integration with Existing Code

Your existing `connect.ts` can serve as the library entry point without changes. Vite will bundle it for distribution.

If you want to add web demos:

1. **Create a Web Demo**: Build a simple web page that uses the SSH connector (e.g., via WebSockets or a backend API).
2. **Environment Variables**: Use Vite's `.env` support for secrets like passphrases.

No additional export file is needed if `connect.ts` already exports the functions.

## Step 8: Testing and Debugging

- **Type Checking**: Run `npm run type-check` regularly.
- **Linting**: Consider adding ESLint with Vite plugin: `npm install --save-dev eslint @vitejs/eslint-config`.
- **Testing**: Integrate with Vitest for unit tests: `npm install --save-dev vitest`.

## Troubleshooting

### Common Issues

- **Module Resolution Errors**: Ensure `tsconfig.json` paths match Vite config.
- **External Dependencies**: Double-check `rollupOptions.external` for Node.js modules.
- **HMR Not Working**: Verify your components are properly exported and imported.

### Performance Tips

- Use `vite build --mode development` for faster dev builds.
- Enable source maps in config: `build: { sourcemap: true }`.

## Next Steps

After setup, consider:

- Migrating jsgui3 demos to Vite for faster development.
- Adding a CI/CD pipeline that runs `npm run build`.
- Exploring Vite plugins for additional features like PWA support or Markdown processing.

For more advanced configurations, refer to the [Vite documentation](https://vitejs.dev/).

If you encounter issues specific to this project's setup, check the existing `connect.ts` patterns and adapt accordingly.