import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Ruta relativa: funciona tanto en la raíz como en GitHub Pages (/pac-man/).
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
