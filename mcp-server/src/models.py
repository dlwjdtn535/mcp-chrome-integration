from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from dataclasses import field

class MessageModel(BaseModel):
    """WebSocket message model"""
    type: str
    # string array 타입
    args: Optional[list[str]] = None
    timestamp: datetime = field(default_factory=datetime.now)
    sender_id: Optional[str] = None 