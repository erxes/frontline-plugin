/* eslint-disable */
const esmDependencies =
  'string-strip-html|codsen-utils|codsen-format-diagnostic-value|lodash-es|ranges-apply|ranges-merge|ranges-push|ranges-sort|string-collapse-leading-whitespace|string-trim-spaces-only|string-left-right';

export default {
  displayName: 'frontline-api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        diagnostics: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/modules/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  transformIgnorePatterns: [
    `node_modules/(?!\\.pnpm/|(?:${esmDependencies})/)`,
    `node_modules/\\.pnpm/(?!(?:${esmDependencies})@)`,
  ],
  forceExit: true,
  coverageDirectory: '../coverage/api',
};
