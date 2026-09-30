import os
import uuid
import json
from datetime import datetime
from typing import List, Dict, Optional
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import Session
from auth import Base, engine, SessionLocal

class ConversationThread(Base):
    __tablename__ = "conversation_threads"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, index=True)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(String, index=True, default="default")
    username = Column(String, index=True)
    role = Column(String)  # "user" or "model"
    content = Column(Text)
    attachments_json = Column(Text, nullable=True)  # JSON list of attachments
    sources_json = Column(Text, nullable=True)      # JSON list of Perplexity source cards
    follow_ups_json = Column(Text, nullable=True)   # JSON list of interactive follow-up pills
    created_at = Column(DateTime, default=datetime.utcnow)

class UserMemory(Base):
    __tablename__ = "user_memories"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    key = Column(String)
    value = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# Auto-migration for SQLite columns
def _ensure_schema():
    with engine.connect() as conn:
        from sqlalchemy import text
        for col in ["sources_json", "follow_ups_json"]:
            try:
                conn.execute(text(f"ALTER TABLE chat_messages ADD COLUMN {col} TEXT"))
                conn.commit()
            except Exception:
                pass
_ensure_schema()

# --- Thread Management ---
def create_thread(username: str, title: str = "New Chat") -> Dict[str, str]:
    if not username:
        username = "default"
    db = SessionLocal()
    try:
        thread = ConversationThread(
            id=str(uuid.uuid4()),
            username=username,
            title=title
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)
        return {
            "id": thread.id,
            "title": thread.title,
            "updated_at": thread.updated_at.isoformat()
        }
    except Exception as e:
        db.rollback()
        print(f"Error creating thread: {e}")
        return {"id": str(uuid.uuid4()), "title": title}
    finally:
        db.close()

def list_threads(username: str) -> List[Dict[str, str]]:
    if not username:
        username = "default"
    db = SessionLocal()
    try:
        threads = (
            db.query(ConversationThread)
            .filter(ConversationThread.username == username)
            .order_by(ConversationThread.updated_at.desc())
            .all()
        )
        return [
            {
                "id": t.id,
                "title": t.title,
                "created_at": t.created_at.strftime("%Y-%m-%d %H:%M"),
                "updated_at": t.updated_at.strftime("%Y-%m-%d %H:%M")
            }
            for t in threads
        ]
    except Exception as e:
        print(f"Error listing threads: {e}")
        return []
    finally:
        db.close()

def get_thread_messages(thread_id: str, limit: int = 50) -> List[Dict[str, any]]:
    if not thread_id:
        return []
    db = SessionLocal()
    try:
        msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.thread_id == thread_id)
            .order_by(ChatMessage.id.asc())
            .limit(limit)
            .all()
        )
        results = []
        for m in msgs:
            attachments = []
            if m.attachments_json:
                try:
                    attachments = json.loads(m.attachments_json)
                except Exception:
                    pass
            sources = []
            if m.sources_json:
                try:
                    sources = json.loads(m.sources_json)
                except Exception:
                    pass
            follow_ups = []
            if m.follow_ups_json:
                try:
                    follow_ups = json.loads(m.follow_ups_json)
                except Exception:
                    pass
            results.append({
                "id": str(m.id),
                "sender": "user" if m.role == "user" else "aisia",
                "text": m.content,
                "attachments": attachments,
                "sources": sources,
                "follow_ups": follow_ups,
                "timestamp": m.created_at.strftime("%H:%M")
            })
        return results
    except Exception as e:
        print(f"Error loading thread messages: {e}")
        return []
    finally:
        db.close()

def delete_thread(thread_id: str) -> bool:
    db = SessionLocal()
    try:
        db.query(ChatMessage).filter(ChatMessage.thread_id == thread_id).delete()
        db.query(ConversationThread).filter(ConversationThread.id == thread_id).delete()
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting thread: {e}")
        return False
    finally:
        db.close()

def update_thread_title(thread_id: str, title: str) -> bool:
    db = SessionLocal()
    try:
        t = db.query(ConversationThread).filter(ConversationThread.id == thread_id).first()
        if t:
            t.title = title
            t.updated_at = datetime.utcnow()
            db.commit()
            return True
        return False
    except Exception as e:
        db.rollback()
        return False
    finally:
        db.close()

# --- Message & Memory Management ---
def save_chat_message(
    username: str, 
    role: str, 
    content: str, 
    thread_id: str = "default",
    attachments: Optional[List[Dict[str, str]]] = None,
    sources: Optional[List[Dict[str, any]]] = None,
    follow_ups: Optional[List[str]] = None
) -> None:
    if not username or not content:
        return
    db = SessionLocal()
    try:
        # Auto-create thread if doesn't exist
        if thread_id != "default":
            t = db.query(ConversationThread).filter(ConversationThread.id == thread_id).first()
            if not t:
                # Use first few words of message as title
                clean_title = " ".join(content.split()[:5])[:30] or "New Chat"
                t = ConversationThread(id=thread_id, username=username, title=clean_title)
                db.add(t)
            else:
                # If title is default, update with query words
                if t.title == "New Chat":
                    t.title = " ".join(content.split()[:5])[:30]
                t.updated_at = datetime.utcnow()

        att_json = json.dumps(attachments) if attachments else None
        sources_json = json.dumps(sources) if sources else None
        follow_ups_json = json.dumps(follow_ups) if follow_ups else None
        msg = ChatMessage(
            username=username, 
            thread_id=thread_id,
            role=role, 
            content=content.strip(),
            attachments_json=att_json,
            sources_json=sources_json,
            follow_ups_json=follow_ups_json
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        print(f"Error saving chat message: {e}")
        db.rollback()
    finally:
        db.close()

def get_recent_history(username: str, thread_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, any]]:
    if not username:
        return []
    db = SessionLocal()
    try:
        query = db.query(ChatMessage).filter(ChatMessage.username == username)
        if thread_id:
            query = query.filter(ChatMessage.thread_id == thread_id)
        msgs = query.order_by(ChatMessage.id.desc()).limit(limit).all()
        msgs.reverse()
        return [
            {
                "id": str(m.id),
                "sender": "user" if m.role == "user" else "aisia",
                "text": m.content,
                "timestamp": m.created_at.strftime("%H:%M")
            }
            for m in msgs
        ]
    except Exception as e:
        print(f"Error loading chat history: {e}")
        return []
    finally:
        db.close()

def clear_chat_history(username: str, thread_id: Optional[str] = None) -> None:
    if not username:
        return
    db = SessionLocal()
    try:
        query = db.query(ChatMessage).filter(ChatMessage.username == username)
        if thread_id:
            query = query.filter(ChatMessage.thread_id == thread_id)
        query.delete()
        db.commit()
    except Exception as e:
        print(f"Error clearing history: {e}")
        db.rollback()
    finally:
        db.close()

def save_user_memory(username: str, key: str, value: str) -> str:
    if not username or not value:
        return "Invalid memory parameters."
    db = SessionLocal()
    try:
        existing = (
            db.query(UserMemory)
            .filter(UserMemory.username == username, UserMemory.key == key)
            .first()
        )
        if existing:
            existing.value = value
            existing.created_at = datetime.utcnow()
        else:
            mem = UserMemory(username=username, key=key, value=value)
            db.add(mem)
        db.commit()
        return f"Saved memory: {key} = {value}"
    except Exception as e:
        db.rollback()
        return f"Error saving memory: {str(e)}"
    finally:
        db.close()

def get_user_memories(username: str) -> List[Dict[str, str]]:
    if not username:
        return []
    db = SessionLocal()
    try:
        mems = db.query(UserMemory).filter(UserMemory.username == username).all()
        return [{"id": str(m.id), "key": m.key, "value": m.value} for m in mems]
    except Exception as e:
        print(f"Error getting memories: {e}")
        return []
    finally:
        db.close()

def delete_user_memory(username: str, key: str) -> bool:
    db = SessionLocal()
    try:
        db.query(UserMemory).filter(UserMemory.username == username, UserMemory.key == key).delete()
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()

def format_memory_for_system_prompt(username: str) -> str:
    memories = get_user_memories(username)
    if not memories:
        return ""
    mem_lines = [f"- {m['key']}: {m['value']}" for m in memories]
    return "\nPersistent User Context & Preferences:\n" + "\n".join(mem_lines)
