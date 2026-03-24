# Architecture

## Inputs

The current scaffold reads a fixture directory containing:

- `current.json`
- `proposed.json`

Each file describes one implementation state:

- proxy metadata
- governance path
- implementation metadata
- storage layout
- privileged functions
- implementation safety signals

## Analysis pipeline

The CLI routes `check` requests into three analyzers:

1. `storage-layout`
2. `authority-diff`
3. `implementation-safety`

Each analyzer emits findings in a shared shape:

- `id`
- `category`
- `severity`
- `title`
- `body`
- `evidence`
- `recommendation`
- `tags`

The findings then flow into:

- a summary and risk score builder
- a next-step recommender
- Markdown and JSON renderers

## Intended future architecture

The differentiator is the layer after this scaffold:

- on-chain loaders for proxy admin, implementation, and governance owner
- semantic call graph extraction for privileged entrypoints
- risk-triggered dynamic checks using simulation or differential fuzzing
- GitHub-native PR annotations and SARIF output
