// The layers of the mod, as in Feature-Sliced Design:
// register.tsx (app) → widgets → features → entities → shared.
// register.tsx is the one imperative file; the layers below it are pure.
const SLICE = '(?:entities|features|widgets)/[^/]+'
const PUBLIC_API = `^hooks/${SLICE}/index\\.(ts|tsx)$`
const LOWER = '^hooks/(shared|entities|features|widgets)/'
// What tsconfig.depcruise.json resolves "claude-code" to: the types Claude Code writes.
const ENGINE = '^\\.claude-plugin/types/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },

    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },

    {
      name: 'only-type-only-from-types',
      severity: 'error',
      from: {},
      to: { path: '\\.d\\.ts$', pathNot: ENGINE, dependencyTypesNot: ['type-only'] },
    },

    {
      name: 'pure-below-app',
      comment: 'Only register.tsx touches the engine: $, atoms, read and update.',
      severity: 'error',
      from: { path: LOWER },
      to: { path: ENGINE, dependencyTypesNot: ['type-only'] },
    },

    { name: 'shared-no-up', severity: 'error', from: { path: '^hooks/shared/' }, to: { path: '^hooks/(?!shared/)' } },
    {
      name: 'entities-no-up',
      severity: 'error',
      from: { path: '^hooks/entities/' },
      to: { path: '^hooks/(features|widgets)/|^hooks/register\\.tsx$' },
    },
    {
      name: 'features-no-up',
      severity: 'error',
      from: { path: '^hooks/features/' },
      to: { path: '^hooks/widgets/|^hooks/register\\.tsx$' },
    },
    { name: 'widgets-no-up', severity: 'error', from: { path: '^hooks/widgets/' }, to: { path: '^hooks/register\\.tsx$' } },

    {
      name: 'entities-no-cross',
      comment: "An entity may name another entity's types, not run its code.",
      severity: 'error',
      from: { path: '^hooks/entities/([^/]+)/' },
      to: { path: '^hooks/entities/[^/]+/', pathNot: '^hooks/entities/$1/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'features-no-cross',
      severity: 'error',
      from: { path: '^hooks/features/([^/]+)/' },
      to: { path: '^hooks/features/[^/]+/', pathNot: '^hooks/features/$1/' },
    },
    {
      name: 'widgets-no-cross',
      severity: 'error',
      from: { path: '^hooks/widgets/([^/]+)/' },
      to: { path: '^hooks/widgets/[^/]+/', pathNot: '^hooks/widgets/$1/' },
    },

    {
      name: 'no-deep-cross-import',
      comment: 'Another slice is reached through its index.ts.',
      severity: 'error',
      from: { path: `^hooks/(${SLICE})/` },
      to: { path: `^hooks/${SLICE}/.+`, pathNot: ['^hooks/$1/', PUBLIC_API] },
    },
    {
      name: 'app-no-deep-import',
      severity: 'error',
      from: { path: '^hooks/register\\.tsx$' },
      to: { path: `^hooks/${SLICE}/.+`, pathNot: PUBLIC_API },
    },
    {
      name: 'shared-no-deep-import',
      severity: 'error',
      from: { path: '^hooks/(?!shared/)' },
      to: { path: '^hooks/shared/[^/]+/.+', pathNot: '^hooks/shared/[^/]+/index\\.ts$' },
    },

    {
      name: 'no-orphans',
      severity: 'error',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '^tests/', '\\.cjs$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', ENGINE] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.d.ts'] },
  },
}
