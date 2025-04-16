import logging
import asyncio
import json
import uvicorn
import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from mcp.server import FastMCP
import threading
from typing import Dict, Any, Optional

from models import MessageModel
from managers import ConnectionManager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get server configuration from environment variables
WEBSOCKET_PORT = int(os.getenv('WEBSOCKET_PORT', '8012'))

# Initialize FastAPI app and managers
app = FastAPI()
manager = ConnectionManager()
mcp = FastMCP()

@mcp.prompt()
def get_prompt() -> str:
    """
    This MCP server provides a bridge between a Chrome extension and server-side automation tools.
    It supports various web automation tasks including:
    
    1. Page Navigation & Interaction:
       - Navigate to URLs
       - Click elements
       - Type text
       - Fill forms
       - Scroll page
       - Extract table data
    
    2. Element Manipulation:
       - Get element information (dimensions, styles, visibility)
       - Wait for elements to appear
       - Change background colors
    
    3. Page Analysis:
       - Get page HTML
       - Count links
       - Extract meta tags
       - Get image information
       - Analyze forms
    
    4. Browser Features:
       - Manage bookmarks
       - Access browsing history
       - Handle downloads
       - Show notifications
       - Manage clipboard
       - Handle cookies
    
    5. System Integration:
       - Get system information
       - Access geolocation
       - Monitor power/battery status
       - Take screenshots
    
    The server uses WebSocket for real-time communication with the Chrome extension
    and provides a robust error handling mechanism for all operations.
    
    Example commands:
    1. Navigate: "tool_navigate_to('https://example.com')"
    2. Click: "tool_click_element('#submit-button')"
    3. Type: "tool_type_text('#search', 'query')"
    4. Extract: "tool_extract_table('.data-table')"
    """
    return get_prompt.__doc__

@app.websocket("/mcp")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint handler"""
    global client_id
    global state

    client_id = await manager.connect(websocket)

    try:
        # Send initial connection confirmation
        welcome_msg = MessageModel(
            type="system",
            args=["Connected successfully. Your client ID is: {client_id}"],
            sender_id="server"
        )
        await manager.send_personal_message(welcome_msg.json(), client_id)

        while True:
            try:
                # Receive and parse message
                data = await websocket.receive_text()
                message = MessageModel.model_validate_json(data)
                logger.info(f"Received message from {client_id}: {message}")

                # Handle different message types
                if message.type == "updateState":
                    # Handle state update
                    if (message.args and isinstance(message.args, list) and len(message.args) > 0):
                        state = message.args[0]

            except json.JSONDecodeError:
                logger.warning(f"Invalid message format from {client_id}")
                error_msg = MessageModel(
                    type="error",
                    args=["Invalid message format. Please send valid JSON."],
                    sender_id="server"
                )
                await manager.send_personal_message(error_msg.json(), client_id)
                continue

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        await manager.broadcast(
            MessageModel(
                type="system",
                args=[f"Client {client_id} left the chat"],
                sender_id="server"
            ).json()
        )
    except Exception as e:
        logger.error(f"Error in websocket connection {client_id}: {str(e)}")
        manager.disconnect(client_id)

@mcp.tool()
def tool_state() -> str:
    """Get the current page state including HTML"""
    return state

@mcp.tool()
async def tool_change_background(color: str = "lightblue") -> str:
    """Change the background color of the page"""
    await manager.broadcast(
        MessageModel(
            type="changeBackground",
            args=[color],
            sender_id="server"
        ).json(),
        exclude=None
    )
    return f"Background color change request sent: {color}"

@mcp.tool()
async def tool_navigate_to(url: str) -> str:
    """Navigate to a specified URL"""
    if not url:
        return "Error: URL is required"
    
    await manager.broadcast(
        MessageModel(
            type="navigateTo",
            args=[url],
            sender_id="server"
        ).json(),
        exclude=None
    )
    return f"Navigation request sent: {url}"

@mcp.tool()
async def tool_click_element(selector: str) -> str:
    """Click an element on the page"""
    if not selector:
        return "Error: Selector is required"
    
    await manager.broadcast(
        MessageModel(
            type="clickElement",
            args=[selector],
            sender_id="server"
        ).json(),
        exclude=None
    )
    return f"Click request sent for selector: {selector}"

@mcp.tool()
async def tool_type_text(selector: str, text: str) -> str:
    """Type text into an input element"""
    if not selector or not text:
        return "Error: Both selector and text are required"
    
    await manager.broadcast(
        MessageModel(
            type="typeText",
            args=[selector, text],
            sender_id="server"
        ).json(),
        exclude=None
    )
    return f"Type text request sent: {text} into {selector}"

@mcp.tool()
def tool_get_element_info(selector: str) -> Dict[str, Any]:
    """Get detailed information about an element on the page.
    
    Args:
        selector: CSS selector to find the element
        
    Returns:
        Dict containing element information including dimensions, styles, and visibility
    """
    manager.broadcast(MessageModel(type="getElementInfo", args=[selector]))
    return {"message": f"Getting element info for selector: {selector}"}

@mcp.tool()
def tool_wait_for_element(selector: str, timeout: int = 5000) -> Dict[str, Any]:
    """Wait for an element to appear on the page.
    
    Args:
        selector: CSS selector to wait for
        timeout: Maximum time to wait in milliseconds (default: 5000)
        
    Returns:
        Dict indicating whether element was found and time elapsed
    """
    manager.broadcast(MessageModel(type="waitForElement", args=[selector, timeout]))
    return {"message": f"Waiting for element: {selector} (timeout: {timeout}ms)"}

@mcp.tool()
def tool_fill_form(form_data: Dict[str, Any]) -> Dict[str, Any]:
    """Fill a form with provided data.
    
    Args:
        form_data: Dictionary mapping selectors to values
        
    Returns:
        Dict containing results of form filling operation
    """
    manager.broadcast(MessageModel(type="fillForm", args=[form_data]))
    return {"message": "Filling form with provided data"}

@mcp.tool()
def tool_extract_table(selector: str) -> Dict[str, Any]:
    """Extract data from a table element.
    
    Args:
        selector: CSS selector for the table
        
    Returns:
        Dict containing table headers and rows
    """
    manager.broadcast(MessageModel(type="extractTable", args=[selector]))
    return {"message": f"Extracting table data from selector: {selector}"}

@mcp.tool()
def tool_take_screenshot(selector: Optional[str] = None) -> Dict[str, Any]:
    """Take a screenshot of the page or specific element.
    
    Args:
        selector: Optional CSS selector for specific element
        
    Returns:
        Dict containing screenshot information
    """
    manager.broadcast(MessageModel(type="takeScreenshot", args=[selector] if selector else []))
    return {"message": f"Taking screenshot{' of element: ' + selector if selector else ''}"}

def main():
    async def run_server():
        config = uvicorn.Config(app, host="localhost", port=WEBSOCKET_PORT, log_level="info")
        server = uvicorn.Server(config)
        await server.serve()

    async def run_mcp():
        await mcp.run_stdio_async()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(asyncio.gather(run_server(), run_mcp()))
    finally:
        loop.close()

if __name__ == "__main__":
    main()
