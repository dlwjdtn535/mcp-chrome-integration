import asyncio
import json
import logging
import os
from typing import Dict, Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from mcp.server import FastMCP

from managers import ConnectionManager
from models import MessageModel

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

@app.websocket("/mcp/{tab_id}")
async def websocket_endpoint(websocket: WebSocket, tab_id: str):
    """WebSocket endpoint handler with tab_id as path variable"""
    try:
        # Connect to the WebSocket
        await manager.connect(websocket, tab_id)
        
        # Send connection confirmation
        welcome_msg = MessageModel(
            type="system",
            args=[f"Connected successfully. Tab ID: {tab_id}"],
            sender_id="server"
        )
        await manager.send_personal_message(welcome_msg.model_dump_json(), tab_id)
        
        # Update tab information
        manager.update_tab_info(tab_id, {
            "url": None,
            "content": None
        })
        
        # Keep the connection alive
        while True:
            try:
                # Receive and parse message
                data = await websocket.receive_text()
                # json string to dict
                message = json.loads(data)
                logger.info(f"Received message from {tab_id}: {message}")

                # Handle different message types
                if message['type'] == "updateState":
                    # Handle state update
                    if (message['args'] and isinstance(message['args'], list) and len(message['args']) > 0):
                        manager.update_tab_info(tab_id, {
                            "url": message['args'][0],
                            "content": message['args'][1]
                        })

            except json.JSONDecodeError:
                logger.warning(f"Invalid message format from {tab_id}")
                error_msg = MessageModel(
                    type="error",
                    args=["Invalid message format. Please send valid JSON."],
                    sender_id="server"
                )
                await manager.send_personal_message(error_msg.model_dump_json(), tab_id)
                continue

    except WebSocketDisconnect:
        await manager.disconnect(tab_id)
    except Exception as e:
        print(f"Error in WebSocket connection: {e}")
        await manager.disconnect(tab_id)


@mcp.tool()
def tool_tab_list() -> Dict[str, Any]:
    """Get a list of all connected tabs

    Returns:
        Dict containing a list of active tabs
    """
    return {"tabs": list(manager.get_active_tabs())}


@mcp.tool()
def tool_state(tab_id: str = None) -> Dict[str, Any]:
    """Get the current state of a specific tab.
    
    Args:
        tab_id: ID of the target tab
        
    Returns:
        Dict containing the current state
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    return manager.get_tab_info(tab_id)

@mcp.tool()
async def tool_change_background(color: str = "lightblue", tab_id: str = None) -> str:
    """Change the background color of the page for a specific tab"""
    if not tab_id:
        return "Error: Tab ID is required"
    
    await manager.send_personal_message(
        MessageModel(
            type="changeBackground",
            args=[color],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return f"Background color change request sent to tab {tab_id}: {color}"

@mcp.tool()
async def tool_navigate_to(url: str, tab_id: str = None) -> str:
    """Navigate to a specified URL for a specific tab"""
    if not url:
        return "Error: URL is required"
    if not tab_id:
        return "Error: Tab ID is required"
    
    await manager.send_personal_message(
        MessageModel(
            type="navigateTo",
            args=[url],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return f"Navigation request sent to tab {tab_id}: {url}"

@mcp.tool()
async def tool_click_element(selector: str, tab_id: str = None) -> str:
    """Click an element on the page for a specific tab"""
    if not selector:
        return "Error: Selector is required"
    if not tab_id:
        return "Error: Tab ID is required"
    
    await manager.send_personal_message(
        MessageModel(
            type="clickElement",
            args=[selector],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return f"Click request sent to tab {tab_id} for selector: {selector}"

@mcp.tool()
async def tool_type_text(selector: str, text: str, tab_id: str = None) -> str:
    """Type text into an input element for a specific tab"""
    if not selector or not text:
        return "Error: Both selector and text are required"
    if not tab_id:
        return "Error: Tab ID is required"
    
    await manager.send_personal_message(
        MessageModel(
            type="typeText",
            args=[selector, text],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return f"Type text request sent to tab {tab_id}: {text} into {selector}"

@mcp.tool()
async def tool_get_element_info(selector: str, tab_id: str = None) -> Dict[str, Any]:
    """Get detailed information about an element on the page for a specific tab.
    
    Args:
        selector: CSS selector to find the element
        tab_id: ID of the target tab
        
    Returns:
        Dict containing element information including dimensions, styles, and visibility
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    await manager.send_personal_message(
        MessageModel(
            type="getElementInfo",
            args=[selector],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return {"message": f"Getting element info for selector: {selector} in tab {tab_id}"}

@mcp.tool()
async def tool_wait_for_element(selector: str, timeout: int = 5000, tab_id: str = None) -> Dict[str, Any]:
    """Wait for an element to appear on the page for a specific tab.
    
    Args:
        selector: CSS selector to wait for
        timeout: Maximum time to wait in milliseconds (default: 5000)
        tab_id: ID of the target tab
        
    Returns:
        Dict indicating whether element was found and time elapsed
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    await manager.send_personal_message(
        MessageModel(
            type="waitForElement",
            args=[selector, timeout],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return {"message": f"Waiting for element: {selector} in tab {tab_id} (timeout: {timeout}ms)"}

@mcp.tool()
async def tool_fill_form(form_data: Dict[str, Any], tab_id: str = None) -> Dict[str, Any]:
    """Fill a form with provided data for a specific tab.
    
    Args:
        form_data: Dictionary mapping selectors to values
        tab_id: ID of the target tab
        
    Returns:
        Dict containing results of form filling operation
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    await manager.send_personal_message(
        MessageModel(
            type="fillForm",
            args=[form_data],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return {"message": f"Form fill request sent to tab {tab_id}"}

@mcp.tool()
async def tool_extract_table(selector: str, tab_id: str = None) -> Dict[str, Any]:
    """Extract data from a table element for a specific tab.
    
    Args:
        selector: CSS selector for the table
        tab_id: ID of the target tab
        
    Returns:
        Dict containing table headers and rows
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    await manager.send_personal_message(
        MessageModel(
            type="extractTable",
            args=[selector],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return {"message": f"Extracting table data from selector: {selector} in tab {tab_id}"}

@mcp.tool()
async def tool_take_screenshot(selector: str = None, tab_id: str = None) -> Dict[str, Any]:
    """Take a screenshot of the page or specific element for a specific tab.
    
    Args:
        selector: Optional CSS selector for specific element
        tab_id: ID of the target tab
        
    Returns:
        Dict containing screenshot information
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    await manager.send_personal_message(
        MessageModel(
            type="takeScreenshot",
            args=[selector] if selector else [],
            sender_id="server"
        ).model_dump_json(),
        tab_id
    )
    return {"message": f"Taking screenshot{' of element: ' + selector if selector else ''} in tab {tab_id}"}


def main():
    async def run_server():
        config = uvicorn.Config(app, host="localhost", port=WEBSOCKET_PORT, log_level="info")
        server = uvicorn.Server(config)
        await server.serve()

    async def run_mcp():
        await mcp.run_stdio_async()

    # async def broadcast_loop():
    #     i = 0
    #     while True:
    #         i += 1
    #         await asyncio.sleep(5)  # time.sleep 대신 asyncio.sleep 사용
    #
    #         print(manager.get_active_tabs())
    #         print(manager.get_tab_info("1089126072"))
    #         print("Sending broadcast message")
    #         await manager.send_personal_message(
    #             MessageModel(
    #                 type="navigateTo",
    #                 args=["https://www.naver.com"],
    #                 sender_id="server"
    #             ).model_dump_json(),
    #             tab_id="1089126072"
    #         )  # 비동기 호출

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(asyncio.gather(run_server(), run_mcp()))
    finally:
        loop.close()

if __name__ == "__main__":
    main()
