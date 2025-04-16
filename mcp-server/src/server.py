import asyncio
import json
import logging
import os
import sys
import socket
import time

import psutil
from pathlib import Path
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
    level=logging.INFO,
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
       - Execute JavaScript code
    
    2. Element Manipulation:
       - Get element information (dimensions, styles, visibility)
       - Wait for elements to appear
       - Change background colors
       - Get page state and content
    
    3. Page Analysis:
       - Get page HTML
       - Count links
       - Extract meta tags
       - Get image information
       - Analyze forms
       - Stream page content
    
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
    
    Usage Examples:
    1. Navigate to a URL:
       tool_navigate_to(url="https://example.com", tab_id="your_tab_id")
    
    2. Click an element:
       tool_click_element(selector="#submit-button", tab_id="your_tab_id")
    
    3. Type text:
       tool_type_text(selector="#search", text="query", tab_id="your_tab_id")
    
    4. Get page state:
       tool_state(tab_id="your_tab_id")
    
    5. Execute JavaScript:
       tool_execute_script(script="console.log('Hello')", tab_id="your_tab_id")
    
    6. Extract table data:
       tool_extract_table(selector=".data-table", tab_id="your_tab_id")
    
    7. Get element info:
       tool_get_element_info(selector=".my-element", tab_id="your_tab_id")
    
    Important Notes:
    1. Chrome Security Restrictions:
       - The extension cannot operate on chrome:// URLs due to Chrome's security restrictions
       - If you're on a chrome:// page, please navigate to a regular website (http:// or https://)
       - Some websites may have Content Security Policy (CSP) that restricts certain operations
       - For JavaScript execution, use appropriate methods based on the website's CSP
    
    2. Tab Management:
       - Always provide tab_id for operations
       - Use tool_tab_list() to get available tabs
       - Check tab state before operations
    
    3. Error Handling:
       - Check return values for success/error status
       - Handle timeouts for wait operations
       - Consider website's loading state
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
        Dict containing basic state information without HTML content
    """
    if not tab_id:
        return {"error": "Tab ID is required"}
    
    tab_info = manager.get_tab_info(tab_id)
    # HTML 컨텐츠를 제외한 기본 정보만 반환
    return {
        "url": tab_info.get("url"),
        "has_content": bool(tab_info.get("content")),
        "content_size": len(tab_info.get("content", "")) if tab_info.get("content") else 0
    }

@mcp.tool()
async def tool_stream_content(tab_id: str = None, chunk_size: int = 10000, chunk_number: int = 1) -> Dict[str, Any]:
    """Get a specific chunk of HTML content from a tab.
    
    Args:
        tab_id: ID of the target tab
        chunk_size: Size of each chunk in characters
        chunk_number: The chunk number to retrieve (starting from 1)
        
    Returns:
        Dict containing chunk information and data
    """
    if not tab_id:
        return {"error": "Tab ID is required"}

    tab_info = manager.get_tab_info(tab_id)
    content = tab_info.get("content", "")
    
    if not content:
        return {"error": "No content available"}

    total_chunks = (len(content) + chunk_size - 1) // chunk_size
    
    if chunk_number < 1 or chunk_number > total_chunks:
        return {"error": f"Invalid chunk number. Must be between 1 and {total_chunks}"}
    
    start_idx = (chunk_number - 1) * chunk_size
    end_idx = min(start_idx + chunk_size, len(content))
    chunk = content[start_idx:end_idx]
    
    return {
        "chunk_number": chunk_number,
        "total_chunks": total_chunks,
        "chunk_size": len(chunk),
        "content": chunk,
        "is_last": chunk_number == total_chunks
    }

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

def write_pid_file() -> Path:
    """
    현재 프로세스의 PID를 파일에 저장합니다.
    
    Returns:
        Path: PID 파일의 경로
    """
    pid_dir = Path.home() / ".mcp-server"
    pid_dir.mkdir(exist_ok=True)
    
    pid_file = pid_dir / "server.pid"
    pid_file.write_text(str(os.getpid()))
    logger.info(f"PID file written to {pid_file}")
    return pid_file

def cleanup_pid_file(pid_file: Path) -> None:
    """
    PID 파일을 정리합니다.
    
    Args:
        pid_file: 정리할 PID 파일의 경로
    """
    try:
        if pid_file.exists():
            pid_file.unlink()
            logger.info(f"PID file removed: {pid_file}")
    except Exception as e:
        logger.error(f"Error removing PID file: {e}")

def kill_process_on_port(port: int) -> bool:
    """
    주어진 포트를 사용하는 프로세스를 종료합니다.
    크로스 플랫폼 지원 (Windows, Linux, macOS)
    
    Args:
        port: 종료할 포트 번호
        
    Returns:
        bool: 프로세스 종료 성공 여부
    """
    try:
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                connections = proc.net_connections()
                for conn in connections:
                    # 포트가 일치하는지 확인
                    if hasattr(conn, 'laddr') and conn.laddr.port == port:
                        logger.info(f"Found process using port {port}: {proc.pid} ({proc.name()})")
                        # 프로세스 종료
                        proc.terminate()
                        # 종료 대기
                        proc.wait(timeout=3)
                        logger.info(f"Successfully terminated process {proc.pid}")
                        return True
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                continue
        return False
    except Exception as e:
        logger.error(f"Error while killing process on port {port}: {e}")
        return False

def is_port_in_use(port: int) -> bool:
    """
    포트가 사용 중인지 확인합니다.
    크로스 플랫폼 지원 (Windows, Linux, macOS)
    
    Args:
        port: 확인할 포트 번호
        
    Returns:
        bool: 포트 사용 여부
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return False
        except socket.error:
            return True

def main():
    # Write PID file
    pid_file = write_pid_file()
    
    try:
        # Check and kill any process using the port
        if is_port_in_use(WEBSOCKET_PORT):
            logger.info(f"Port {WEBSOCKET_PORT} is in use. Attempting to kill the process...")
            if kill_process_on_port(WEBSOCKET_PORT):
                logger.info(f"Successfully killed process using port {WEBSOCKET_PORT}")
                # 잠시 대기하여 포트가 해제될 때까지 기다림
                for _ in range(5):
                    if not is_port_in_use(WEBSOCKET_PORT):
                        break
                    asyncio.sleep(1)
            else:
                logger.error(f"Failed to kill process using port {WEBSOCKET_PORT}")
                sys.exit(1)

        async def run_server():
            config = uvicorn.Config(
                app,
                host="localhost",
                port=WEBSOCKET_PORT,
                log_level="info",
                loop="asyncio"
            )
            server = uvicorn.Server(config)
            await server.serve()

        async def run_mcp():
            await mcp.run_stdio_async()

        async def run_all():
            await asyncio.gather(run_server(), run_mcp())

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            loop.run_until_complete(run_all())
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        finally:
            loop.close()
            
    finally:
        # Clean up PID file
        cleanup_pid_file(pid_file)

if __name__ == "__main__":
    main()
