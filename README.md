# MCP (Model Control Protocol)

A protocol that enables AI models to control Chrome browser and perform web automation.

## Key Features

### 1. Page Navigation & Interaction
- URL Navigation
- Element Clicking
- Text Input
- Form Filling
- Page Scrolling
- Table Data Extraction
- JavaScript Code Execution

### 2. Element Manipulation
- Get Element Information (dimensions, styles, visibility)
- Wait for Elements
- Change Background Colors
- Get Page State and Content

### 3. Page Analysis
- Get HTML Content
- Count Links
- Extract Meta Tags
- Get Image Information
- Form Analysis
- Page Content Streaming

### 4. Browser Features
- Bookmark Management
- Access Browser History
- Handle Downloads
- Show Notifications
- Clipboard Management
- Cookie Handling

### 5. System Integration
- Get System Information
- Access Geolocation
- Monitor Power/Battery Status
- Take Screenshots

## Usage Examples

```python
# Navigate to URL
tool_navigate_to(url="https://example.com", tab_id="your_tab_id")

# Click Element
tool_click_element(selector="#submit-button", tab_id="your_tab_id")

# Type Text
tool_type_text(selector="#search", text="query", tab_id="your_tab_id")

# Check Page State
tool_state(tab_id="your_tab_id")

# Execute JavaScript
tool_execute_script(script="console.log('Hello')", tab_id="your_tab_id")

# Extract Table Data
tool_extract_table(selector=".data-table", tab_id="your_tab_id")

# Get Element Info
tool_get_element_info(selector=".my-element", tab_id="your_tab_id")
```

## Important Notes

### 1. Chrome Security Restrictions
- Does not work on chrome:// URLs
- Only works on regular websites (http:// or https://)
- Some websites' Content Security Policy (CSP) may restrict certain operations
- Consider website's CSP when executing JavaScript

### 2. Tab Management
- tab_id required for all operations
- Use tool_tab_list() to check available tabs
- Check tab state before operations

### 3. Error Handling
- Check return values for success/failure status
- Handle timeouts for wait operations
- Consider website loading state

## Installation & Setup

### 1. Chrome Extension Installation & Setup
1. Prepare Extension
   ```bash
   # Navigate to extension directory
   cd mcp-client
   ```

2. Install in Chrome Browser
   - Open Chrome browser
   - Enter `chrome://extensions/` in address bar
   - Enable "Developer mode" toggle in top-right
   - Click "Load unpacked" button in top-left
   - Select the `mcp-client` directory

3. Configure Extension
   - Click MCP extension icon in Chrome toolbar
   - Enter server URL (default: `ws://localhost:8012`)
   - Click "Connect" button to connect to server
   - Connection status should change to "Connected"

4. Using the Extension
   - Works automatically in connected tabs
   - For new tabs, click extension icon and connect
   - Monitor operations in log window
   - Click "Disconnect" to end connection

### 2. Server Setup
```bash
# Navigate to server directory
cd mcp-server

# Install dependencies
pip install -r requirements.txt

# Start server
python src/server.py
```

## Extension Features

### 1. Popup Interface
- Server URL Configuration
- Connect/Disconnect Button
- Current Tab Status
- Log Message Viewer

### 2. Background Features
- Tab Management
- WebSocket Connection Maintenance
- Automatic Reconnection
- Error Recovery

### 3. Security Features
- HTTPS Support
- CSP Compliance
- Secure Script Execution
- Permission Management

### 4. Debugging
- Log Viewing in Developer Tools
- Detailed Error Messages
- Network Communication Monitoring
- Execution State Tracking

## Troubleshooting

### 1. Connection Issues
- Verify Server URL
- Check Server Status
- Check Firewall Settings
- Verify WebSocket Port (8012) Availability

### 2. Execution Errors
- Check CSP Restrictions
- Grant Required Permissions
- Review Console Error Messages
- Validate Tab IDs

### 3. Performance Issues
- Monitor Memory Usage
- Disconnect Unused Tabs
- Adjust Status Update Frequency
- Optimize Large Data Processing

## License

MIT 