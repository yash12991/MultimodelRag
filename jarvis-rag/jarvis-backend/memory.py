import os
import uuid
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import Session
from auth import Base, engine, SessionLocal

logging.getLogger("mem0").setLevel(logging.ERROR)

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

# --- Mem0 Intelligent Autonomous Memory Engine ---
_mem0_client = None
_mem0_init_attempted = False

def get_mem0_client():
    """Initializes and returns the singleton Mem0 client using local Chroma and Gemini models."""
    global _mem0_client, _mem0_init_attempted
    if _mem0_client is not None:
        return _mem0_client
    if _mem0_init_attempted:
        return None
    
    _mem0_init_attempted = True
    try:
        from dotenv import load_dotenv
        load_dotenv("/Users/yashsonawane/Advance structural /.env")
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("API_KEY")
        if not api_key:
            print("[Mem0] Warning: No GOOGLE_API_KEY or API_KEY found in environment.")
            return None
        os.environ["GOOGLE_API_KEY"] = api_key
        os.environ["API_KEY"] = api_key
        
        from mem0 import Memory
        config = {
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": "jarvis_mem0_memories",
                    "path": "./chroma_mem0"
                }
            },
            "llm": {
                "provider": "gemini",
                "config": {
                    "model": "gemini-3.5-flash-lite",
                    "api_key": api_key
                }
            },
            "embedder": {
                "provider": "gemini",
                "config": {
                    "model": "models/gemini-embedding-001",
                    "api_key": api_key
                }
            },
            "history_db_path": "./mem0_history.db"
        }
        _mem0_client = Memory.from_config(config)
        _migrate_sqlite_to_mem0(_mem0_client)
        return _mem0_client
    except Exception as e:
        print(f"[Mem0] Error initializing Mem0: {e}")
        return None

def _migrate_sqlite_to_mem0(client):
    """One-time sync of any unmigrated SQLite user_memories into Mem0."""
    try:
        db = SessionLocal()
        rows = db.query(UserMemory).all()
        if not rows:
            db.close()
            return
        
        for r in rows:
            u = r.username or "default"
            val = r.value or ""
            key = r.key or "Fact"
            if val:
                try:
                    text_to_add = f"{key}: {val}" if not val.lower().startswith(key.lower()) else val
                    client.add(text_to_add, user_id=u, metadata={"key": key, "legacy_id": r.id})
                except Exception:
                    pass
        db.close()
    except Exception as e:
        print(f"[Mem0 Migration] Note: {e}")

def save_user_memory(username: str, key: str, value: str) -> str:
    """Saves a user memory into Mem0 vector storage and mirrors into SQLite."""
    if not username or not value:
        return "Invalid memory parameters."
    
    clean_username = username.strip() or "default"
    clean_key = (key or "Fact").strip()
    clean_val = value.strip()
    mem_text = f"{clean_key}: {clean_val}" if clean_key.lower() not in ["fact", "note", "memory"] else clean_val

    client = get_mem0_client()
    if client:
        try:
            client.add(mem_text, user_id=clean_username, metadata={"key": clean_key})
        except Exception as e:
            print(f"[Mem0] Error saving memory: {e}")

    # Mirror to SQLite for relational fallback
    db = SessionLocal()
    try:
        existing = (
            db.query(UserMemory)
            .filter(UserMemory.username == clean_username, UserMemory.key == clean_key)
            .first()
        )
        if existing:
            existing.value = clean_val
            existing.created_at = datetime.utcnow()
        else:
            mem = UserMemory(username=clean_username, key=clean_key, value=clean_val)
            db.add(mem)
        db.commit()
        return f"Saved memory: {clean_key} = {clean_val}"
    except Exception as e:
        db.rollback()
        return f"Error saving memory to DB: {str(e)}"
    finally:
        db.close()

def get_user_memories(username: str) -> List[Dict[str, Any]]:
    """Returns all long-term memories for a user from Mem0 (with fallback to SQLite)."""
    if not username:
        return []
    clean_username = username.strip() or "default"
    
    client = get_mem0_client()
    if client:
        try:
            all_mems = client.get_all(filters={"user_id": clean_username})
            raw_list = all_mems.get("results", []) if isinstance(all_mems, dict) else (all_mems or [])
            if raw_list:
                results = []
                for m in raw_list:
                    meta = m.get("metadata") or {}
                    key = meta.get("key") or "Fact"
                    mem_val = m.get("memory", "")
                    results.append({
                        "id": str(m.get("id")),
                        "key": key,
                        "value": mem_val,
                        "created_at": m.get("created_at", "")
                    })
                return results
        except Exception as e:
            print(f"[Mem0] Error reading memories from Mem0: {e}")
            
    # Fallback to SQLite table
    db = SessionLocal()
    try:
        mems = db.query(UserMemory).filter(UserMemory.username == clean_username).all()
        return [{"id": str(m.id), "key": m.key, "value": m.value} for m in mems]
    except Exception as e:
        print(f"Error getting memories from SQLite: {e}")
        return []
    finally:
        db.close()

def delete_user_memory_by_id(memory_id: str) -> bool:
    """Deletes a memory by ID from Mem0 and SQLite."""
    if not memory_id:
        return False
    success = False
    client = get_mem0_client()
    if client:
        try:
            client.delete(memory_id)
            success = True
        except Exception as e:
            print(f"[Mem0] Error deleting memory from Mem0: {e}")
    
    # Also delete from SQLite if numeric ID or legacy ID
    db = SessionLocal()
    try:
        if str(memory_id).isdigit():
            db.query(UserMemory).filter(UserMemory.id == int(memory_id)).delete()
            db.commit()
            success = True
    except Exception:
        db.rollback()
    finally:
        db.close()
    return success

def delete_user_memory(username: str, key: str) -> bool:
    """Deletes a memory matching a key from SQLite and attempts Mem0 sync."""
    clean_username = username.strip() or "default"
    db = SessionLocal()
    try:
        db.query(UserMemory).filter(UserMemory.username == clean_username, UserMemory.key == key).delete()
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()

def search_user_memories(username: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Performs semantic vector search across all memories of a user using Mem0."""
    if not username or not query:
        return []
    clean_username = username.strip() or "default"
    client = get_mem0_client()
    if client:
        try:
            search_res = client.search(query, filters={"user_id": clean_username}, limit=limit)
            raw = search_res.get("results", []) if isinstance(search_res, dict) else (search_res or [])
            results = []
            for r in raw:
                results.append({
                    "id": str(r.get("id")),
                    "memory": r.get("memory", ""),
                    "score": float(r.get("score", 0.0)),
                    "metadata": r.get("metadata") or {}
                })
            return results
        except Exception as e:
            print(f"[Mem0] Error searching Mem0 memories: {e}")

    # Fallback keyword matching
    mems = get_user_memories(clean_username)
    q_lower = query.lower()
    matched = [m for m in mems if m["key"].lower() in q_lower or any(w in q_lower for w in m["value"].lower().split() if len(w) > 3)]
    return [{"id": str(m["id"]), "memory": f"{m['key']}: {m['value']}", "score": 0.5} for m in matched[:limit]]

def format_memory_for_system_prompt(username: str, query: Optional[str] = None) -> str:
    """
    Constructs the system prompt memory context.
    If `query` is provided, semantically retrieves the top relevant memories for that query using Mem0!
    """
    if not username:
        return ""
    clean_username = username.strip() or "default"

    if query:
        recalled = search_user_memories(clean_username, query, limit=5)
        if recalled:
            mem_lines = [f"- {m['memory']}" for m in recalled]
            return "\nPersistent User Context & Relevant Memories (via Mem0):\n" + "\n".join(mem_lines)

    memories = get_user_memories(clean_username)
    if not memories:
        return ""
    mem_lines = [f"- {m['value']}" if m['key'] == 'Fact' else f"- {m['key']}: {m['value']}" for m in memories[:8]]
    return "\nPersistent User Context & Preferences (via Mem0):\n" + "\n".join(mem_lines)

def auto_extract_conversation_memory(username: str, query: str, assistant_reply: Optional[str] = None):
    """
    Autonomously extracts facts, preferences, goals, and personal details using Mem0.
    """
    if not username or not query:
        return
    clean_username = username.strip() or "default"
    client = get_mem0_client()
    if not client:
        return
    try:
        if assistant_reply:
            messages = [
                {"role": "user", "content": query},
                {"role": "assistant", "content": assistant_reply}
            ]
            client.add(messages, user_id=clean_username)
        else:
            client.add(query, user_id=clean_username)
    except Exception as e:
        print(f"[Mem0 Auto-Extract] Note: {e}")

