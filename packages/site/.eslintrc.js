module.exports = {
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['!.eslintrc.js', '.cache/', 'public/'],

  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        'import/no-nodejs-modules': ['error', { allow: ['buffer', 'crypto'] }],
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        'jsdoc/require-jsdoc': 0,
      },
    },
  ],
};
