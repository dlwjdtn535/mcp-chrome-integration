# MCP Client - Chrome Extension

A Chrome extension that acts as a client for the MCP (Model Control Protocol) system, allowing AI models to control and interact with the Chrome browser.

## Features

- Connects to MCP Server via WebSockets
- Enables browser control through remote commands
- Supports various browser interactions:
  - Navigation
  - Element clicking
  - Text input
  - Content extraction
  - Script execution
  - DOM observation
  - Waiting for elements
  - Scrolling

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top-right corner)
4. Click "Load unpacked" and select the `mcp-client` directory

## Usage

1. Click the MCP Client icon in your Chrome toolbar
2. Enter the WebSocket server URL (e.g., `ws://localhost:8080`)
3. Click "Connect" to establish a connection to the MCP server

The extension will now listen for commands from the server and execute them in the browser.

## Command Protocol

Commands are sent from the server to the client as JSON messages in the following format:

```json
{
  "type": "command",
  "data": {
    "action": "navigate",
    "url": "https://example.com"
  }
}
```

### Supported Commands

- **navigate**: Navigate to a URL
  ```json
  { "action": "navigate", "url": "https://example.com" }
  ```

- **click**: Click on an element
  ```json
  { "action": "click", "selector": "#submit-button" }
  ```

- **type**: Type text into an input field
  ```json
  { "action": "type", "selector": "#search-input", "text": "search query" }
  ```

- **getContent**: Get page content
  ```json
  { "action": "getContent", "selector": "#main-content" }
  ```

- **executeScript**: Execute custom JavaScript
  ```json
  { "action": "executeScript", "script": "document.title = 'New Title';" }
  ```

- **getElementDetails**: Get detailed information about an element
  ```json
  { "action": "getElementDetails", "selector": ".product-item" }
  ```

- **waitForElement**: Wait for an element to appear
  ```json
  { "action": "waitForElement", "selector": ".loaded-content", "timeout": 5000 }
  ```

- **scrollTo**: Scroll to an element or position
  ```json
  { "action": "scrollTo", "selector": "#section-2" }
  ```

- **observeDOM**: Start observing DOM changes
  ```json
  { "action": "observeDOM", "selector": "#dynamic-content" }
  ```

- **stopObserving**: Stop DOM observation
  ```json
  { "action": "stopObserving" }
  ```

## Security Considerations

The extension has broad permissions to interact with web pages. Only connect to trusted MCP servers, as they will have the ability to control your browser and access page content.

## Development

To modify or extend the extension:

1. Edit the relevant files:
   - `manifest.json`: Extension configuration
   - `popup.html` and `popup.js`: UI and connection management
   - `background.js`: WebSocket connection and command handling
   - `content.js`: Page interaction functions

2. Reload the extension in `chrome://extensions/` after making changes

## License

MIT 