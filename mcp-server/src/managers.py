import logging
from typing import Dict, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Modern WebSocket connection manager"""
    def __init__(self):
        # Dictionary to store WebSocket connections by tab ID
        self.connections: Dict[str, WebSocket] = {}
        # Dictionary to store tab information
        self.tab_info: Dict[str, dict] = {}
        self.connection_groups: Dict[str, Set[str]] = {}
        self._connection_counter = 0

    def _generate_client_id(self) -> str:
        """Generate a unique client ID"""
        self._connection_counter += 1
        return f"client_{self._connection_counter}"

    async def connect(self, websocket: WebSocket, tab_id: str) -> str:
        """Connect a new WebSocket client for a specific tab"""
        await websocket.accept()
        self.connections[tab_id] = websocket
        logger.info(f"New connection established for tab {tab_id}")
        return tab_id

    def disconnect(self, tab_id: str):
        """Disconnect a WebSocket client for a specific tab"""
        if tab_id in self.connections:
            del self.connections[tab_id]
            logger.info(f"Connection closed for tab {tab_id}")
        if tab_id in self.tab_info:
            del self.tab_info[tab_id]
            # Remove from all groups
            for group in self.connection_groups.values():
                group.discard(tab_id)

    async def send_personal_message(self, message: str, tab_id: str):
        """Send a message to a specific tab"""
        if tab_id in self.connections:
            await self.connections[tab_id].send_text(message)
            
    async def broadcast(self, message: str, exclude: Optional[str] = None):
        """Broadcast a message to all connected tabs except the excluded one"""
        for tab_id, connection in self.connections.items():
            if tab_id != exclude:
                await connection.send_text(message)
                
    def update_tab_info(self, tab_id: str, info: dict):
        """Update information for a specific tab"""
        self.tab_info[tab_id] = info
        
    def get_tab_info(self, tab_id: str) -> Optional[dict]:
        """Get information for a specific tab"""
        return self.tab_info.get(tab_id)
        
    def get_active_tabs(self) -> Set[str]:
        """Get all active tab IDs"""
        return set(self.connections.keys())

    async def broadcast_to_group(self, group_name: str, message: str, exclude: Optional[str] = None) -> None:
        """Broadcast a message to a specific group"""
        if group_name not in self.connection_groups:
            logger.warning(f"Group {group_name} not found")
            return

        for client_id in self.connection_groups[group_name]:
            if client_id != exclude and client_id in self.connections:
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