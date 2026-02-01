# model.yaml schema

Use the published JSON Schema for `model.yaml` to get validation and autocomplete in YAML-aware editors.

## Schema URL

- JSON Schema: `/schema/model.schema.json`

## Enable in VS Code

If you use the VS Code YAML extension, add this comment to the top of your `model.yaml`:

```yaml
# yaml-language-server: $schema=https://domainlang.net/schema/model.schema.json
```

This associates the file with the schema and enables:

- Validation (unknown keys, missing required fields)
- Autocomplete for known keys
- Hover documentation

## Notes

- The schema is designed to match the current `model.yaml` format described in the import system.
- The schema is forward-compatible via `x-...` extension keys.
