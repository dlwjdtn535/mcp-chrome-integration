import logging
import asyncio
import json
import time

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

# Initialize FastAPI app and managers
app = FastAPI()
manager = ConnectionManager()

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



# async def run():
#     # MCP stdio (LM Studio 연동용)
#     mcp_stdio = asyncio.create_task(mcp.run_stdio_async())
#
#     await asyncio.gather(mcp_stdio, fastapi_server)

def main():
    async def run_server():
        config = uvicorn.Config(app, host="localhost", port=8012, log_level="info")
        server = uvicorn.Server(config)
        await server.serve()

    async def broadcast_loop():
        i = 0
        while True:
            i += 1
            await asyncio.sleep(1)  # time.sleep 대신 asyncio.sleep 사용
            print("Sending broadcast message")
            await manager.broadcast("test", exclude="client_1")  # 비동기 호출

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(asyncio.gather(run_server(), broadcast_loop()))
    finally:
        loop.close()

if __name__ == "__main__":
    main()

