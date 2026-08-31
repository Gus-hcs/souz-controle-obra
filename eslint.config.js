import globals from 'globals';

/**
 * Regras de qualidade do projeto. A ideia não é implicar com estilo — disso
 * cuida o Prettier — e sim pegar o que costuma virar bug: variável esquecida,
 * comparação frouxa, promessa sem await, escopo vazando.
 */
export default [
  { ignores: ['dist/**', 'dist-local/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, claude: 'readonly',
        /* bibliotecas carregadas sob demanda por CDN */
        XLSX: 'readonly', jspdf: 'readonly', supabase: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-implicit-globals': 'error',
      'no-return-await': 'warn',
      'require-await': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
    },
  },
  {
    files: ['tests/**'],
    rules: { 'no-console': 'off' },
  },
];
