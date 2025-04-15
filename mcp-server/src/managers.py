import logging
from typing import Dict, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Modern WebSocket connection manager"""
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_groups: Dict[str, Set[str]] = {}
        self._connection_counter = 0

    def _generate_client_id(self) -> str:
        """Generate a unique client ID"""
        self._connection_counter += 1
        return f"client_{self._connection_counter}"

    async def connect(self, websocket: WebSocket) -> str:
        """Accept and store a new WebSocket connection"""
        await websocket.accept()
        client_id = self._generate_client_id()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}")
        return client_id

    def disconnect(self, client_id: str) -> None:
        """Remove a WebSocket connection"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            # Remove from all groups
            for group in self.connection_groups.values():
                group.discard(client_id)
            logger.info(f"Client disconnected: {client_id}")

    async def send_personal_message(self, message: str, client_id: str) -> bool:
        """Send a message to a specific client"""
        if client_id not in self.active_connections:
            logger.warning(f"Client {client_id} not found")
            return False
        
        try:
            websocket = self.active_connections[client_id]
            await websocket.send_text(message)
            logger.info(f"Message sent to {client_id}: {message}")
            return True
        except Exception as e:
            logger.error(f"Error sending message to {client_id}: {str(e)}")
            return False

    async def broadcast(self, message: str, exclude: Optional[str] = None) -> None:
        """Broadcast a message to all connected clients"""
        disconnected_clients = set()
        
        for client_id, websocket in self.active_connections.items():
            if client_id != exclude:
                try:
                    await websocket.send_text(message)
                except WebSocketDisconnect:
                    disconnected_clients.add(client_id)
                except Exception as e:
                    logger.error(f"Error broadcasting to {client_id}: {str(e)}")
                    disconnected_clients.add(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)
        
        logger.info(f"Broadcast message sent: {message}")

    async def broadcast_to_group(self, group_name: str, message: str, exclude: Optional[str] = None) -> None:
        """Broadcast a message to a specific group"""
        if group_name not in self.connection_groups:
            logger.warning(f"Group {group_name} not found")
            return

        for client_id in self.connection_groups[group_name]:
            if client_id != exclude and client_id in self.active_connections:
                await self.send_personal_message(message, client_id)

    def add_to_group(self, group_name: str, client_id: str) -> None:
        """Add a client to a group"""
        if group_name not in self.connection_groups:
            self.connection_groups[group_name] = set()
        self.connection_groups[group_name].add(client_id)
        logger.info(f"Added {client_id} to group {group_name}")

    def remove_from_group(self, group_name: str, client_id: str) -> None:
        """Remove a client from a group"""
        if group_name in self.connection_groups:
            self.connection_groups[group_name].discard(client_id)
            logger.info(f"Removed {client_id} from group {group_name}") 