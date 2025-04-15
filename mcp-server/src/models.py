from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from dataclasses import field

class MessageModel(BaseModel):
    """WebSocket message model"""
    type: str
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    sender_id: Optional[str] = None 