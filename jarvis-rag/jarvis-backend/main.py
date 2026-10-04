from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import shutil
from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
import auth

load_dotenv()

app = FastAPI(title="Aisia AI Agent Backend")

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

class ChatRequest(BaseModel):
    query: str

@app.get("/")
def read_root():
    return {"status": "Aisia AI Agent Backend is running"}

@app.post("/register", response_model=auth.Token)
def register(user: auth.UserCreate, db: Session = Depends(auth.get_db)):
    db_user = db.query(auth.User).filter(auth.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = auth.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": new_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/login", response_model=auth.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(auth.get_db)):
    user = db.query(auth.User).filter(auth.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/chat")
def chat_endpoint(request: ChatRequest, current_user: auth.User = Depends(auth.get_current_user)):
    import agent
    reply = agent.chat_with_agent(request.query)
    return {"reply": reply}

@app.post("/upload")
def upload_file(file: UploadFile = File(...), current_user: auth.User = Depends(auth.get_current_user)):
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    import multimodal_ingest
    import rag_engine
    ingest_result = multimodal_ingest.process_file_multimodal(file_path)
    chunks = rag_engine.index_documents()
    return {
        "filename": file.filename,
        "type": ingest_result.get("type", "file"),
        "summary": ingest_result.get("summary", ""),
        "chunks": chunks,
        "message": f"Successfully ingested {file.filename}! {ingest_result.get('summary', '')}"
    }

@app.post("/query")
def query_documents(request: QueryRequest):
    import rag_engine
    print(f"Received query: {request.query}")
    results = rag_engine.query_knowledge_base(request.query)
    return {
        "results": results
    }

from fastapi.responses import StreamingResponse, Response, FileResponse
import stream_manager

import memory

class StreamRequest(BaseModel):
    query: str
    voice: str = "en-US-AvaNeural"
    rate: str = "+0%"
    username: Optional[str] = "default"
    thread_id: Optional[str] = "default"
    attachments: Optional[List[dict]] = None
    model: Optional[str] = "gemini-3.5-flash-lite"
    language: Optional[str] = "en-US"
    agent_mode: Optional[str] = "general"
    pitch: Optional[str] = "+0Hz"
    persona: Optional[str] = "empathetic"

@app.post("/chat/stream")
async def chat_stream_endpoint(request: StreamRequest):
    return StreamingResponse(
        stream_manager.stream_agent_events(
            query=request.query, 
            voice=request.voice, 
            rate=request.rate,
            pitch=request.pitch or "+0Hz",
            persona=request.persona or "empathetic",
            username=request.username or "default",
            thread_id=request.thread_id or "default",
            attachments=request.attachments,
            model_name=request.model or "gemini-3.5-flash-lite",
            language=request.language or "en-US",
            agent_mode=request.agent_mode or "general"
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


class CreateThreadRequest(BaseModel):
    title: Optional[str] = "New Chat"
    username: Optional[str] = "default"

class UpdateThreadRequest(BaseModel):
    title: str

@app.get("/threads")
def list_threads_endpoint(username: str = "default"):
    threads = memory.list_threads(username)
    return {"threads": threads}

@app.post("/threads")
def create_thread_endpoint(request: CreateThreadRequest):
    thread = memory.create_thread(request.username or "default", request.title or "New Chat")
    return {"thread": thread}

@app.get("/threads/{thread_id}/messages")
def get_thread_messages_endpoint(thread_id: str):
    messages = memory.get_thread_messages(thread_id)
    return {"messages": messages}

@app.delete("/threads/{thread_id}")
def delete_thread_endpoint(thread_id: str):
    success = memory.delete_thread(thread_id)
    return {"success": success}

@app.patch("/threads/{thread_id}")
def update_thread_endpoint(thread_id: str, request: UpdateThreadRequest):
    success = memory.update_thread_title(thread_id, request.title)
    return {"success": success}

@app.get("/chat/history")
def get_chat_history(username: str = "default", thread_id: Optional[str] = None):
    history = memory.get_recent_history(username, thread_id=thread_id, limit=40)
    return {"history": history}

@app.delete("/chat/history")
def delete_chat_history(username: str = "default"):
    memory.clear_chat_history(username)
    return {"status": "cleared"}

@app.get("/memory")
def get_user_memory(username: str = "default"):
    memories = memory.get_user_memories(username)
    return {"memories": memories}

@app.get("/memory/search")
def search_memory_endpoint(query: str, username: str = "default"):
    results = memory.search_user_memories(username, query)
    return {"results": results}

class MemorySaveRequest(BaseModel):
    key: str
    value: str
    username: str = "default"

@app.post("/memory")
def save_memory_endpoint(request: MemorySaveRequest):
    res = memory.save_user_memory(request.username, request.key, request.value)
    return {"message": res}

@app.delete("/memory/{memory_id}")
def delete_memory_endpoint(memory_id: str):
    success = memory.delete_user_memory_by_id(memory_id)
    return {"status": "deleted" if success else "not_found", "id": memory_id}


@app.get("/documents")
def list_documents():
    if not os.path.exists("uploads"):
        return {"documents": []}
    files = []
    import multimodal_ingest
    for f in os.listdir("uploads"):
        if not f.startswith(".") and not f.endswith(".transcript.txt") and not f.endswith(".meta.json"):
            path = os.path.join("uploads", f)
            meta = multimodal_ingest.get_file_metadata(path)
            ext = os.path.splitext(f)[1].lower()
            
            # Determine type & icon
            file_type = meta.get("file_type")
            if not file_type:
                if ext == ".pdf": file_type = "pdf"
                elif ext in [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac", ".flac"]: file_type = "audio"
                elif ext in [".mp4", ".mov", ".avi", ".mkv"]: file_type = "video"
                else: file_type = "text"
                
            icon = "pdf"
            type_label = "PDF Document"
            if file_type == "audio":
                icon = "audio"
                type_label = "Audio / Meeting Recording"
            elif file_type == "video":
                icon = "video"
                type_label = "Video Presentation / Inspection"
            elif file_type == "text":
                icon = "file"
                type_label = "Document / Code"
                
            has_transcript = os.path.exists(f"{path}.transcript.txt")
            
            files.append({
                "name": f,
                "size_kb": round(os.path.getsize(path) / 1024, 1),
                "modified": os.path.getmtime(path),
                "type": file_type,
                "type_label": type_label,
                "icon": icon,
                "summary": meta.get("summary", f"{type_label}"),
                "has_transcript": has_transcript
            })
    return {"documents": files}

@app.get("/documents/{filename}/transcript")
def get_document_transcript(filename: str):
    file_path = os.path.join("uploads", filename)
    transcript_path = f"{file_path}.transcript.txt"
    if os.path.exists(transcript_path):
        with open(transcript_path, "r", encoding="utf-8") as f:
            return {"filename": filename, "transcript": f.read()}
    if os.path.exists(file_path):
        import multimodal_ingest
        meta = multimodal_ingest.get_file_metadata(file_path)
        return {"filename": filename, "transcript": meta.get("summary", "No transcript generated yet.")}
    raise HTTPException(status_code=404, detail="Transcript not found")

@app.delete("/documents/{filename}")
def delete_document(filename: str):
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        # Clean up any associated transcript or metadata files
        if os.path.exists(f"{file_path}.transcript.txt"):
            try: os.remove(f"{file_path}.transcript.txt")
            except Exception: pass
        if os.path.exists(f"{file_path}.meta.json"):
            try: os.remove(f"{file_path}.meta.json")
            except Exception: pass
            
        import rag_engine
        chunks = rag_engine.index_documents()
        return {"status": "deleted", "filename": filename, "remaining_chunks": chunks}
    raise HTTPException(status_code=404, detail="File not found")

@app.api_route("/pdf/download/{filename}", methods=["GET", "HEAD"])
def download_pdf_endpoint(filename: str):
    import pdf_generator
    safe_name = os.path.basename(filename)
    file_path = os.path.join(pdf_generator.PDF_DIR, safe_name)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf", filename=safe_name)
    raise HTTPException(status_code=404, detail="PDF not found")

@app.api_route("/pdf/view/{filename}", methods=["GET", "HEAD"])
def view_pdf_endpoint(filename: str):
    import pdf_generator
    safe_name = os.path.basename(filename)
    file_path = os.path.join(pdf_generator.PDF_DIR, safe_name)
    if os.path.exists(file_path):
        return FileResponse(
            file_path, 
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=\"{safe_name}\""}
        )
    raise HTTPException(status_code=404, detail="PDF not found")

class PDFGenerateRequest(BaseModel):
    title: str
    content: str
    author: Optional[str] = "Aisia Autonomous AI"

@app.post("/pdf/generate")
def generate_pdf_endpoint(req: PDFGenerateRequest):
    import pdf_generator
    result = pdf_generator.generate_pdf_document(title=req.title, content=req.content, author=req.author or "Aisia Autonomous AI")
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate PDF"))
    return result

@app.api_route("/image/download/{filename}", methods=["GET", "HEAD"])
def download_image_endpoint(filename: str):
    import image_generator
    safe_name = os.path.basename(filename)
    file_path = os.path.join(image_generator.IMAGE_DIR, safe_name)
    if os.path.exists(file_path):
        if safe_name.endswith(".svg"):
            media_type = "image/svg+xml"
        elif safe_name.endswith(".jpg") or safe_name.endswith(".jpeg"):
            media_type = "image/jpeg"
        elif safe_name.endswith(".webp"):
            media_type = "image/webp"
        else:
            media_type = "image/png"
        return FileResponse(file_path, media_type=media_type, filename=safe_name)
    raise HTTPException(status_code=404, detail="Image not found")

@app.api_route("/image/view/{filename}", methods=["GET", "HEAD"])
def view_image_endpoint(filename: str):
    import image_generator
    safe_name = os.path.basename(filename)
    file_path = os.path.join(image_generator.IMAGE_DIR, safe_name)
    if os.path.exists(file_path):
        if safe_name.endswith(".svg"):
            media_type = "image/svg+xml"
        elif safe_name.endswith(".jpg") or safe_name.endswith(".jpeg"):
            media_type = "image/jpeg"
        elif safe_name.endswith(".webp"):
            media_type = "image/webp"
        else:
            media_type = "image/png"
        return FileResponse(
            file_path, 
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename=\"{safe_name}\""}
        )
    raise HTTPException(status_code=404, detail="Image not found")

class ImageGenerateRequest(BaseModel):
    prompt: str
    style: Optional[str] = "cinematic"
    aspect_ratio: Optional[str] = "1:1"

@app.post("/image/generate")
def generate_image_endpoint(req: ImageGenerateRequest):
    import image_generator
    result = image_generator.generate_image(prompt=req.prompt, style=req.style or "cinematic", aspect_ratio=req.aspect_ratio or "1:1")
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate image"))
    return result

class ImageEditRequest(BaseModel):
    image: str  # Base64 data URI, raw base64, file path, or URL
    prompt: str
    model: Optional[str] = "black-forest-labs/flux.1-kontext-pro"

@app.post("/image/edit")
def edit_image_endpoint(req: ImageEditRequest):
    import image_generator
    result = image_generator.edit_image(image_input=req.image, prompt=req.prompt, model=req.model or "black-forest-labs/flux.1-kontext-pro")
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to edit image"))
    return result

@app.get("/system/status")
def system_status():
    import mcp_manager
    notion_configured = bool(os.getenv("NOTION_KEY"))
    github_configured = bool(os.getenv("GITHUB_TOKEN"))
    api_configured = bool(os.getenv("API_KEY"))
    servers = mcp_manager.get_all_mcp_servers()
    integrations_dict = {}
    for s in servers:
        integrations_dict[s["id"]] = {
            "name": s["name"],
            "status": s["status"],
            "icon": s.get("icon", "tool"),
            "category": s.get("category", "General"),
            "tools_count": s.get("tool_count", 0)
        }
    return {
        "status": "online",
        "agent": "Aisia",
        "engine": "Edge Neural TTS + Gemini 3.5 Flash",
        "stream_latency_target_ms": 450,
        "mcp_servers_count": len(servers),
        "integrations": integrations_dict
    }

class MCPExecuteRequest(BaseModel):
    tool: str
    arguments: Optional[dict] = None

class MCPAddServerRequest(BaseModel):
    name: str
    endpoint: str
    category: Optional[str] = "Custom Integrations"
    description: Optional[str] = ""

@app.get("/mcp/servers")
def get_mcp_servers():
    import mcp_manager
    return {"servers": mcp_manager.get_all_mcp_servers()}

@app.post("/mcp/execute")
def execute_mcp_endpoint(req: MCPExecuteRequest):
    import mcp_manager
    result = mcp_manager.execute_mcp_tool(req.tool, req.arguments or {})
    return {"tool": req.tool, "result": result}

@app.post("/mcp/add")
def add_mcp_endpoint(req: MCPAddServerRequest):
    import mcp_manager
    new_s = mcp_manager.add_custom_mcp_server(req.name, req.endpoint, req.category, req.description)
    return {"status": "success", "server": new_s}

class NotionTodoRequest(BaseModel):
    task: str
    page: str = "To Do List"

class NotionPageRequest(BaseModel):
    title: str
    content: str = ""

class NotionUpdateRequest(BaseModel):
    page: str
    content: str

@app.get("/notion/pages")
def get_notion_pages():
    import notion_tools
    notion = notion_tools.get_notion_client()
    if not notion:
        return {"pages": []}
    try:
        results = notion.search().get("results", [])
        pages = []
        for r in results:
            obj_type = r.get("object")
            title = "Untitled"
            if obj_type == "page":
                for _, v in r.get("properties", {}).items():
                    if v.get("type") == "title":
                        t = v.get("title", [])
                        if t: title = t[0].get("plain_text", "Untitled")
            elif obj_type == "database":
                t = r.get("title", [])
                if t: title = t[0].get("plain_text", "Untitled")
            pages.append({
                "id": r.get("id"),
                "type": obj_type,
                "title": title,
                "url": r.get("url", "")
            })
        return {"pages": pages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/notion/todo")
def add_notion_todo_endpoint(request: NotionTodoRequest):
    import notion_tools
    res = notion_tools.add_notion_todo(f"{request.task}|{request.page}")
    return {"message": res}

@app.post("/notion/create-page")
def create_notion_page_endpoint(request: NotionPageRequest):
    import notion_tools
    res = notion_tools.create_notion_page(f"{request.title}|{request.content}")
    return {"message": res}

@app.post("/notion/update")
def update_notion_page_endpoint(request: NotionUpdateRequest):
    import notion_tools
    res = notion_tools.update_notion_page(f"{request.page}|{request.content}")
    return {"message": res}

@app.get("/notion/read")
def read_notion_page_endpoint(page: str):
    import notion_tools
    content = notion_tools.read_notion_page(page)
    return {"content": content}


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-AvaNeural"
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"
    language: Optional[str] = "en-US"

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    import edge_tts
    
    clean = stream_manager.clean_text_for_tts(request.text)
    if not clean:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    resolved_voice = stream_manager.resolve_voice_for_text(clean, request.voice, request.language)
    communicate = edge_tts.Communicate(
        clean, 
        resolved_voice, 
        rate=request.rate or "+0%",
        pitch=request.pitch or "+0Hz"
    )
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
            
    return Response(content=audio_data, media_type="audio/mpeg")


# --- GitHub Integration Endpoints ---
class GitHubPushFileItem(BaseModel):
    path: str
    content: str

class GitHubPushRequest(BaseModel):
    repo: str
    files: List[GitHubPushFileItem]
    message: Optional[str] = "Update via Aisia"
    branch: Optional[str] = None
    create_if_missing: Optional[bool] = True

class GitHubCreateRepoRequest(BaseModel):
    name: str
    description: Optional[str] = "Created via Aisia"
    private: Optional[bool] = False

@app.get("/github/repos")
def get_github_repos_endpoint():
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC")
    if not token:
        return {"repos": [], "error": "GITHUB_TOKEN not configured"}
    try:
        from github import Github, Auth
        g = Github(auth=Auth.Token(token))
        user = g.get_user()
        repos = []
        for r in user.get_repos(sort="updated")[:25]:
            repos.append({
                "name": r.name,
                "full_name": r.full_name,
                "description": r.description or "",
                "html_url": r.html_url,
                "private": r.private,
                "default_branch": r.default_branch,
                "language": r.language or "",
                "stars": r.stargazers_count,
                "updated_at": r.updated_at.isoformat() if r.updated_at else ""
            })
        return {"user": user.login, "repos": repos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/github/create-repo")
def create_github_repo_endpoint(req: GitHubCreateRepoRequest):
    import big_agent_tools
    res = big_agent_tools.create_github_repo(json.dumps({
        "name": req.name,
        "description": req.description,
        "private": req.private
    }))
    return {"result": res}

@app.post("/github/push")
def push_to_github_endpoint(req: GitHubPushRequest):
    import big_agent_tools
    files_payload = [{"path": f.path, "content": f.content} for f in req.files]
    res = big_agent_tools.push_project_to_github(json.dumps({
        "repo": req.repo,
        "files": files_payload,
        "message": req.message or "Update via Aisia",
        "branch": req.branch,
        "create_if_missing": req.create_if_missing
    }))
    return {"result": res}


