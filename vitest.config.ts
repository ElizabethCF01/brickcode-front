import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Use the automatic JSX runtime so component tests (.tsx) work without an
  // explicit `import React` — matching the app's tsconfig (jsx: react-jsx).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
