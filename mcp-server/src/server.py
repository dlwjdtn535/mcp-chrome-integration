import logging
import asyncio
import json
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from mcp.server import FastMCP
import threading

from models import MessageModel
from managers import ConnectionManager

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up FastAPI application")
    yield
    # Shutdown
    logger.info("Shutting down FastAPI application")

# Initialize FastAPI app and managers
app = FastAPI(lifespan=lifespan)
manager = ConnectionManager()
mcp = FastMCP()

@app.websocket("/mcp")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint handler"""
    client_id = await manager.connect(websocket)

    try:
        # Send initial connection confirmation
        welcome_msg = MessageModel(
            type="system",
            content=f"Connected successfully. Your client ID is: {client_id}",
            sender_id="server"
        )
        await manager.send_personal_message(welcome_msg.json(), client_id)

        while True:
            try:
                # Receive and parse message
                data = await websocket.receive_text()
                message = MessageModel.parse_raw(data)
                logger.info(f"Received message from {client_id}: {message}")

                # Handle different message types
                if message.type == "broadcast":
                    await manager.broadcast(message.json(), exclude=client_id)
                elif message.type == "group":
                    group_name = message.content.get("group")
                    if group_name:
                        await manager.broadcast_to_group(
                            group_name,
                            message.json(),
                            exclude=client_id
                        )
                else:  # Direct message
                    response = MessageModel(
                        type="response",
                        content=f"Received: {message.content}",
                        sender_id="server"
                    )
                    await manager.send_personal_message(response.json(), client_id)

            except json.JSONDecodeError:
                logger.warning(f"Invalid message format from {client_id}")
                error_msg = MessageModel(
                    type="error",
                    content="Invalid message format. Please send valid JSON.",
                    sender_id="server"
                )
                await manager.send_personal_message(error_msg.json(), client_id)
                continue

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        await manager.broadcast(
            MessageModel(
                type="system",
                content=f"Client {client_id} left the chat",
                sender_id="server"
            ).json()
        )
    except Exception as e:
        logger.error(f"Error in websocket connection {client_id}: {str(e)}")
        manager.disconnect(client_id)

def run_fastapi():
    """Run the FastAPI application"""
    uvicorn.run(app, host="0.0.0.0", port=8099, log_level="debug")

async def run_mcp():
    """Run the MCP server"""
    try:
        await mcp.run(transport="stdio")
    except Exception as e:
        logger.error(f"MCP server error: {str(e)}")
        raise

@mcp.tool()
def tool_example():
    """Example tool for MCP server"""
    return {"success": True, "message": "This is an example tool"}

@mcp.tool()
def tool_another_example():
    """Another example tool for MCP server"""
    return {"success": True, "message": "This is another example tool"}

def main():
    """Main function to start the servers"""
    logger.info("Starting MCP Chrome server...")
    
    try:
        # Start MCP server in a separate thread
        mcp_thread = threading.Thread(target=lambda: asyncio.run(run_mcp()))
        mcp_thread.daemon = True
        mcp_thread.start()
        
        # Run FastAPI in main thread
        run_fastapi()
    except KeyboardInterrupt:
        logger.info("Shutting down servers...")
    except Exception as e:
        logger.error(f"Server error: {str(e)}")

if __name__ == "__main__":
    import threading
    main()
