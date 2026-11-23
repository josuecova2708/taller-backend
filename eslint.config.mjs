// Análisis estático del backend (ESLint 9, configuración plana).
//
// Usa las reglas recomendadas de typescript-eslint sin información de tipos:
// detectan errores comunes (variables sin usar, código inalcanzable, `any`
// explícito…) sin hacer lento el análisis. Se ejecuta en GitHub Actions con
// `npm run lint:check`, que solo informa; `npm run lint` además corrige.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'scripts/**/*.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      // Las respuestas de Prisma, Firebase y la IA se tipan a mano en varios
      // puntos: se avisa, pero no bloquea la integración.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Un parámetro que empieza con _ se deja sin usar a propósito.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // En los tests se reemplazan módulos con jest.mock y require dinámico.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
);
