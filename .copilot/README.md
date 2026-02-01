# MCP Server Configuration

This directory contains Model Context Protocol (MCP) server configurations for GitHub Copilot Workspace.

## Configured MCP Servers

This repository includes three MCP servers to enhance GitHub Copilot capabilities:

1. **Microsoft Docs** - Search official Microsoft/Azure documentation
2. **Context7** - Search library documentation and code examples
3. **Perplexity** - Search the web using Perplexity AI

## Setup Instructions

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure API Keys

Edit `.env` and add your API keys:

```bash
# Perplexity API Key (required for web search)
# Get your API key from: https://www.perplexity.ai/settings/api
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Context7 API Key (required for library documentation)
# Get your API key from: https://context7.com
CONTEXT7_API_KEY=your_context7_api_key_here
```

**Note**: Microsoft Docs server doesn't require an API key.

### 3. Restart GitHub Copilot

- In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
- Run "Developer: Reload Window" or restart VS Code
- GitHub Copilot will automatically load all MCP server configurations

### 4. Verify Setup

Test each server in GitHub Copilot chat:

- **Microsoft Docs**: "Search Microsoft documentation for Azure Functions"
- **Context7**: "Find documentation for React hooks"
- **Perplexity**: "Search the web for the latest TypeScript features"

## MCP Server Details

### Microsoft Docs (HTTP)

- **Type**: HTTP-based MCP server
- **Purpose**: Search official Microsoft Learn documentation
- **URL**: https://learn.microsoft.com/api/mcp
- **Authentication**: None required
- **Tools**: All available (`*`)

### Context7 (HTTP)

- **Type**: HTTP-based MCP server
- **Purpose**: Search library documentation and code examples
- **URL**: https://mcp.context7.com/mcp
- **Authentication**: API key via `CONTEXT7_API_KEY` header
- **Tools**: All available (`*`)
- **API Key**: Required (get from [context7.com](https://context7.com))

### Perplexity (stdio)

- **Type**: stdio-based MCP server
- **Purpose**: Web search using Perplexity AI
- **Command**: `npx -y @perplexity-ai/mcp-server`
- **Authentication**: API key via `PERPLEXITY_API_KEY` environment variable
- **Tools**: All available (`*`)
- **API Key**: Required (get from [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api))

## Configuration Structure

The `mcp-config.json` file contains:

```json
{
  "mcpServers": {
    "microsoft-docs": {
      "type": "http",
      "url": "https://learn.microsoft.com/api/mcp",
      "tools": ["*"]
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "tools": ["*"],
      "headers": {
        "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
      }
    },
    "perplexity": {
      "command": "npx",
      "args": ["-y", "@perplexity-ai/mcp-server"],
      "tools": ["*"],
      "env": {
        "PERPLEXITY_API_KEY": "${PERPLEXITY_API_KEY}"
      },
      "type": "stdio"
    }
  }
}
```

## Troubleshooting

### Issue: Copilot doesn't show MCP capabilities

- Ensure your `.env` file is in the repository root
- Verify API keys are valid and properly formatted
- Check that environment variables are set correctly
- Restart VS Code completely (not just reload)

### Issue: "API_KEY is not set" error

- Make sure you copied `.env.example` to `.env`
- Verify the keys are correctly formatted in `.env`
- Ensure there are no extra spaces around the `=` sign
- Check that variable names match exactly

### Issue: HTTP servers not responding

- Check your internet connection
- Verify the server URLs are accessible
- For Context7, ensure API key is valid
- Try accessing URLs directly in a browser

### Issue: stdio server fails to start

- Ensure Node.js and npx are installed
- Try running `npx -y @perplexity-ai/mcp-server` manually
- Check for network issues blocking npm registry
- Clear npm cache if needed: `npm cache clean --force`

## Security Notes

⚠️ **Important**: Never commit your `.env` file or expose your API keys

- The `.env` file is already in `.gitignore`
- Only commit `.env.example` with placeholder values
- Rotate your API keys immediately if accidentally exposed
- Use different API keys for development and production
- Store production keys in secure environment variable systems

## Additional Resources

- [MCP Servers Directory](https://github.com/modelcontextprotocol/servers)
- [GitHub Copilot MCP Documentation](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Perplexity AI Documentation](https://docs.perplexity.ai/)
- [Context7 Documentation](https://context7.com/docs)
- [Microsoft Learn MCP API](https://learn.microsoft.com/)
