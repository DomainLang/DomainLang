# yaml-language-server: $schema=https://domainlang.net/schema/model.schema.json

# Package identity (required for publishing)
model:
  name: {{name}}
  version: {{version}}
  entry: {{entry}}

# Path aliases for @ imports
paths:
  "@": "."
  "@domains": "./domains"

# External dependencies
dependencies:
  # Short form: package-key: "git-ref"
  # e.g.: acme/ddd-core: "v1.0.0"