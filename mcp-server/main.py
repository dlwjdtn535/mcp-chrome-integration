import asyncio
import websockets
from mcp import tool

# Define the MCP tool
class HiTool(tool.Tool):
    async def execute(self, *args, **kwargs):
        # Send "hi" message to the WebSocket client
        await self.websocket.send("hi")
        # Wait for the response from the client
        response = await self.websocket.recv()
        print(f"Received response from client: {response}")
        return response

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
        
        await websocket.send(response)

async def start_websocket_server():
    server = await websockets.serve(websocket_handler, "localhost", 8765)
    print("WebSocket server started on ws://localhost:8765")
    await server.wait_closed()

async def start_mcp_server():
    # MCP 서버 초기화
    server = tool.MCPServer()

    # 서버 설정 (포트, 호스트 등)
    server.configure(port=6277, host='0.0.0.0')

    # Register the HiTool
    hi_tool = HiTool()
    server.register_tool("hi", hi_tool)

    # 서버 시작
    server.start()

async def main():
    # 웹소켓 서버와 MCP 서버를 동시에 실행
    await asyncio.gather(
        start_websocket_server(),
        start_mcp_server()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Servers stopped by user")
