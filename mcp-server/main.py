import logging

import websockets
from mcp.server import FastMCP

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Log environment variables
mcp = FastMCP()
websocket_server = websockets.serve(websocket_handler, "localhost", 8099)

async def websocket_handler(websocket, path):
    async for message in websocket:
        print(f"Received message: {message}")
        
        # 메시지에 따라 다른 응답을 보냅니다.
        if message == "hello":
            response = "Hello, client!"
        elif message == "bye":
            response = "Goodbye!"
        else:
            response = f"Echo: {message}"
        
        websocket.send(response)


if __name__ == "__main__":
    mcp.run(transport="stdio")