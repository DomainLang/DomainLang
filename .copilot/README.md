# MCP Server Configuration

This directory contains Model Context Protocol (MCP) server configurations for GitHub Copilot Workspace.

## Perplexity MCP Server

The Perplexity MCP server enables GitHub Copilot to perform web searches using Perplexity AI's search capabilities.

### Setup Instructions

1. **Get a Perplexity API Key**
   - Visit [Perplexity AI Settings](https://www.perplexity.ai/settings/api)
   - Sign up or log in to your account
   - Generate an API key

2. **Configure Environment Variable**
   - Copy `.env.example` to `.env` in the repository root:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and replace `your_api_key_here` with your actual Perplexity API key:
     ```bash
     PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     ```

3. **Restart GitHub Copilot**
   - In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run "Developer: Reload Window" or restart VS Code
   - GitHub Copilot will automatically load the MCP server configuration

4. **Verify Setup**
   - Open GitHub Copilot chat
   - Try asking: "Search the web for the latest TypeScript features"
   - Copilot should now be able to use Perplexity to search the web

### Configuration Details

The `mcp-config.json` file configures the Perplexity MCP server with:
- **Command**: `npx` to run the server package
- **Package**: `@modelcontextprotocol/server-perplexity-ask`
- **Environment**: `PERPLEXITY_API_KEY` loaded from your environment

### Troubleshooting

**Issue**: Copilot doesn't show web search capabilities
- Ensure your `.env` file is in the repository root
- Verify the API key is valid
- Check that the environment variable is properly set
- Restart VS Code completely

**Issue**: "PERPLEXITY_API_KEY is not set" error
- Make sure you copied `.env.example` to `.env`
- Verify the key is correctly formatted in `.env`
- Ensure there are no extra spaces around the `=` sign

### Security Notes

⚠️ **Important**: Never commit your `.env` file or expose your API key
- The `.env` file is already in `.gitignore`
- Only commit `.env.example` with placeholder values
- Rotate your API key immediately if accidentally exposed

### Additional MCP Servers

You can add more MCP servers to `mcp-config.json`. For examples, see:
- [MCP Servers Directory](https://github.com/modelcontextprotocol/servers)
- [GitHub Copilot MCP Documentation](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
