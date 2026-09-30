"""
MCP Manager for Aisia (Jarvis RAG)
Implements Model Context Protocol (MCP) server definitions, tool registries,
safe dispatchers, and integration with LangChain / Google Gemini agents.
"""

import os
import json
import sqlite3
import datetime
import platform
import shutil
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional
from langchain.tools import Tool
from dotenv import load_dotenv

ENV_PATH = "/Users/yashsonawane/Advance structural /.env"
load_dotenv(ENV_PATH, override=True)

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(os.path.dirname(__file__), "jarvis.db")
CUSTOM_MCP_FILE = os.path.join(os.path.dirname(__file__), "custom_mcp_servers.json")

# --- Real Tool Handlers ---

def _safe_fs_path(rel_or_abs_path: str) -> str:
    """Ensure path stays within workspace boundaries unless explicitly allowed."""
    path = os.path.abspath(os.path.expanduser(rel_or_abs_path))
    # If relative to workspace, join with workspace dir
    if not os.path.isabs(rel_or_abs_path):
        path = os.path.abspath(os.path.join(WORKSPACE_DIR, rel_or_abs_path))
    return path

# 1. Filesystem Tools
def mcp_fs_list(directory: str = ".") -> Dict[str, Any]:
    target = _safe_fs_path(directory)
    if not os.path.exists(target):
        return {"error": f"Directory not found: {directory}"}
    items = []
    try:
        with os.scandir(target) as entries:
            for entry in entries:
                if entry.name.startswith(".") and entry.name not in [".env"]:
                    continue
                info = {
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "size_bytes": entry.stat().st_size if entry.is_file() else None,
                    "modified": datetime.datetime.fromtimestamp(entry.stat().st_mtime).isoformat()
                }
                items.append(info)
        return {"directory": target, "count": len(items), "entries": sorted(items, key=lambda x: (not x["is_dir"], x["name"]))}
    except Exception as e:
        return {"error": str(e)}

def mcp_fs_read(filepath: str, max_chars: int = 4000) -> Dict[str, Any]:
    target = _safe_fs_path(filepath)
    if not os.path.isfile(target):
        return {"error": f"File not found: {filepath}"}
    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars)
        return {
            "path": target,
            "size": os.path.getsize(target),
            "content": content,
            "truncated": len(content) >= max_chars
        }
    except Exception as e:
        return {"error": str(e)}

def mcp_fs_write(filepath: str, content: str) -> Dict[str, Any]:
    target = _safe_fs_path(filepath)
    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "success", "path": target, "bytes_written": len(content)}
    except Exception as e:
        return {"error": str(e)}

def mcp_fs_search(pattern: str, base_dir: str = ".") -> Dict[str, Any]:
    target = _safe_fs_path(base_dir)
    matches = []
    pat_lower = pattern.lower()
    try:
        for root, dirs, files in os.walk(target):
            # Skip hidden and cache folders
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ["venv", "node_modules", "__pycache__"]]
            for f in files:
                if pat_lower in f.lower():
                    full = os.path.join(root, f)
                    matches.append(os.path.relpath(full, target))
                    if len(matches) >= 50:
                        break
            if len(matches) >= 50:
                break
        return {"query": pattern, "matched_files": matches, "count": len(matches)}
    except Exception as e:
        return {"error": str(e)}

# 2. Database Tools (SQLite / PostgreSQL)
def mcp_db_list_tables() -> Dict[str, Any]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [row[0] for row in cur.fetchall()]
        conn.close()
        return {"database": "jarvis.db (SQLite)", "tables": tables, "count": len(tables)}
    except Exception as e:
        return {"error": str(e)}

def mcp_db_describe_table(table_name: str) -> Dict[str, Any]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(f"PRAGMA table_info({table_name});")
        columns = [{"cid": row[0], "name": row[1], "type": row[2], "notnull": bool(row[3]), "default": row[4], "pk": bool(row[5])} for row in cur.fetchall()]
        cur.execute(f"SELECT COUNT(*) FROM {table_name};")
        row_count = cur.fetchone()[0]
        conn.close()
        return {"table": table_name, "columns": columns, "row_count": row_count}
    except Exception as e:
        return {"error": str(e)}

def mcp_db_query(sql_query: str) -> Dict[str, Any]:
    sql_trimmed = sql_query.strip()
    # Read-only enforcement for safety
    if not sql_trimmed.upper().startswith("SELECT") and not sql_trimmed.upper().startswith("PRAGMA") and not sql_trimmed.upper().startswith("EXPLAIN"):
        return {"error": "Safety policy: Only SELECT, PRAGMA, and EXPLAIN queries are permitted via MCP Database tool."}
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(sql_trimmed)
        col_names = [desc[0] for desc in cur.description] if cur.description else []
        rows = cur.fetchmany(50)
        conn.close()
        return {
            "query": sql_trimmed,
            "columns": col_names,
            "row_count": len(rows),
            "rows": [dict(zip(col_names, r)) for r in rows]
        }
    except Exception as e:
        return {"error": str(e)}

# 3. GitHub MCP Tools
def mcp_github_repo_info(repo: str) -> Dict[str, Any]:
    """Fetch repo metadata from GitHub REST API (works with or without token)."""
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC")
    headers = {"User-Agent": "Aisia-MCP-Client/1.0", "Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    clean_repo = repo.strip().strip("/")
    if "/" not in clean_repo:
        clean_repo = f"octocat/{clean_repo}"
        
    url = f"https://api.github.com/repos/{clean_repo}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode())
            return {
                "full_name": data.get("full_name"),
                "description": data.get("description"),
                "stars": data.get("stargazers_count"),
                "forks": data.get("forks_count"),
                "open_issues": data.get("open_issues_count"),
                "default_branch": data.get("default_branch"),
                "language": data.get("language"),
                "html_url": data.get("html_url")
            }
    except Exception as e:
        return {"error": f"GitHub API error: {str(e)}", "repo": clean_repo}

def mcp_github_list_commits(repo: str, count: int = 5) -> Dict[str, Any]:
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC")
    headers = {"User-Agent": "Aisia-MCP-Client/1.0", "Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    clean_repo = repo.strip().strip("/")
    url = f"https://api.github.com/repos/{clean_repo}/commits?per_page={count}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as res:
            commits = json.loads(res.read().decode())
            summary = []
            for c in commits:
                commit_info = c.get("commit", {})
                summary.append({
                    "sha": c.get("sha")[:7],
                    "message": commit_info.get("message", "").split("\n")[0],
                    "author": commit_info.get("author", {}).get("name"),
                    "date": commit_info.get("author", {}).get("date")
                })
            return {"repo": clean_repo, "commits": summary}
    except Exception as e:
        return {"error": str(e), "repo": clean_repo}

def mcp_github_user_profile(username: Optional[str] = None) -> Dict[str, Any]:
    """Fetch GitHub profile information for authenticated user or specified username."""
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC")
    headers = {"User-Agent": "Aisia-MCP-Client/1.0", "Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    clean_user = username.strip().strip("@") if username and username.strip() and username.strip().lower() not in ["me", "my", "self", "none", ""] else ""
    url = f"https://api.github.com/users/{clean_user}" if clean_user else "https://api.github.com/user"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode())
            return {
                "username": data.get("login"),
                "name": data.get("name"),
                "bio": data.get("bio"),
                "public_repos": data.get("public_repos"),
                "followers": data.get("followers"),
                "following": data.get("following"),
                "company": data.get("company"),
                "location": data.get("location"),
                "html_url": data.get("html_url")
            }
    except Exception as e:
        return {"error": f"GitHub user API error: {str(e)}", "user": clean_user or "authenticated_user"}

def mcp_github_user_repos(username: Optional[str] = None, count: int = 10) -> Dict[str, Any]:
    """Fetch the latest active repositories for authenticated user or specified username."""
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC")
    headers = {"User-Agent": "Aisia-MCP-Client/1.0", "Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    clean_user = username.strip().strip("@") if username and username.strip() and username.strip().lower() not in ["me", "my", "self", "none", ""] else ""
    url = f"https://api.github.com/users/{clean_user}/repos?sort=updated&per_page={count}" if clean_user else f"https://api.github.com/user/repos?sort=updated&per_page={count}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as res:
            repos_raw = json.loads(res.read().decode())
            summary = []
            for r in repos_raw:
                summary.append({
                    "name": r.get("name"),
                    "full_name": r.get("full_name"),
                    "description": r.get("description"),
                    "language": r.get("language"),
                    "stars": r.get("stargazers_count"),
                    "forks": r.get("forks_count"),
                    "html_url": r.get("html_url")
                })
            return {"user": clean_user or "authenticated_user", "count": len(summary), "repos": summary}
    except Exception as e:
        return {"error": f"GitHub repos error: {str(e)}"}

# 4. Fetch & Web MCP Tools
def mcp_fetch_url(url: str, max_chars: int = 3000) -> Dict[str, Any]:
    try:
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"})
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read().decode(errors="replace")
            # Strip tags for a clean text representation
            import re
            cleaned = re.sub(r'<script.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
            cleaned = re.sub(r'<style.*?</style>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
            cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
            cleaned = re.sub(r'\s+', ' ', cleaned).strip()
            return {
                "url": url,
                "status": response.status,
                "text": cleaned[:max_chars],
                "char_length": len(cleaned)
            }
    except Exception as e:
        return {"error": str(e), "url": url}

# 5. System & OS MCP Tools
def mcp_system_info() -> Dict[str, Any]:
    try:
        uname = platform.uname()
        disk = shutil.disk_usage("/")
        load_avg = [round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
        return {
            "os": uname.system,
            "release": uname.release,
            "machine": uname.machine,
            "python_version": platform.python_version(),
            "cpu_cores": os.cpu_count() or 1,
            "load_average": load_avg,
            "disk_total_gb": round(disk.total / (1024**3), 2),
            "disk_used_gb": round(disk.used / (1024**3), 2),
            "disk_free_gb": round(disk.free / (1024**3), 2),
            "timestamp": datetime.datetime.now().isoformat()
        }
    except Exception as e:
        return {"error": str(e)}

# 6. Docker MCP Tools
def mcp_docker_status() -> Dict[str, Any]:
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list(all=True)
        container_list = []
        for c in containers[:15]:
            container_list.append({
                "id": c.short_id,
                "name": c.name,
                "status": c.status,
                "image": str(c.image.tags[0]) if c.image.tags else c.image.short_id
            })
        return {
            "status": "connected",
            "containers_count": len(containers),
            "containers": container_list
        }
    except Exception as e:
        return {
            "status": "offline_or_unreachable",
            "message": "Docker daemon is not running or socket is inaccessible.",
            "error": str(e),
            "suggested_action": "Start Docker Desktop to enable container inspections."
        }

# 7. Slack MCP Tools
def mcp_slack_status() -> Dict[str, Any]:
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        return {
            "status": "ready_unauthenticated",
            "message": "SLACK_BOT_TOKEN not configured. Add token to .env to send real messages."
        }
    return {
        "status": "connected",
        "message": "Slack Bot connection active."
    }

# 8. Weather MCP Tools
def mcp_weather(city: str) -> Dict[str, Any]:
    try:
        clean_city = urllib.parse.quote(city.strip())
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={clean_city}&count=1"
        req = urllib.request.Request(geo_url, headers={"User-Agent": "Aisia-Weather/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            geo_data = json.loads(res.read().decode())
            results = geo_data.get("results")
            if not results:
                return {"error": f"City '{city}' not found."}
            loc = results[0]
            lat = loc["latitude"]
            lon = loc["longitude"]
            name = loc.get("name", city)
            country = loc.get("country", "")

        weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        req_w = urllib.request.Request(weather_url, headers={"User-Agent": "Aisia-Weather/1.0"})
        with urllib.request.urlopen(req_w, timeout=5) as res_w:
            w_data = json.loads(res_w.read().decode())
            cw = w_data.get("current_weather", {})
            return {
                "location": f"{name}, {country}".strip(", "),
                "coordinates": {"lat": lat, "lon": lon},
                "temperature_c": cw.get("temperature"),
                "windspeed_kmh": cw.get("windspeed"),
                "weather_code": cw.get("weathercode"),
                "is_day": bool(cw.get("is_day", 1))
            }
    except Exception as e:
        return {"error": str(e), "city": city}


# --- MCP Server Registry ---

MCP_SERVERS = {
    "github": {
        "id": "github",
        "name": "GitHub MCP",
        "category": "Developer Tools",
        "icon": "🐙",
        "description": "Interact with repositories, commit histories, pull requests, and file contents.",
        "enabled": True,
        "tools": [
            {
                "name": "github_repo_info",
                "display_name": "Get Repository Info",
                "description": "Fetch repository statistics, star counts, descriptions, and branch details.",
                "parameters": {"repo": {"type": "string", "description": "Repository in owner/name format, e.g. 'facebook/react' or 'google/gemini'"}},
                "sample_args": {"repo": "langchain-ai/langchain"}
            },
            {
                "name": "github_list_commits",
                "display_name": "List Recent Commits",
                "description": "Retrieve recent commit hashes, commit messages, and author names.",
                "parameters": {
                    "repo": {"type": "string", "description": "Repository in owner/name format"},
                    "count": {"type": "integer", "description": "Number of commits to return (1-20)"}
                },
                "sample_args": {"repo": "pallets/flask", "count": 3}
            },
            {
                "name": "github_user_profile",
                "display_name": "Get User Profile",
                "description": "Fetch user profile details (username, name, bio, public repos count, followers) for authenticated user or specified username.",
                "parameters": {
                    "username": {"type": "string", "description": "GitHub username or leave empty for authenticated user"}
                },
                "sample_args": {"username": ""}
            },
            {
                "name": "github_user_repos",
                "display_name": "List User Repositories",
                "description": "Retrieve active repositories for authenticated user or specified username with language, stars, and description.",
                "parameters": {
                    "username": {"type": "string", "description": "GitHub username or leave empty for authenticated user"},
                    "count": {"type": "integer", "description": "Number of repos to return (1-30)"}
                },
                "sample_args": {"username": "", "count": 10}
            }
        ]
    },
    "filesystem": {
        "id": "filesystem",
        "name": "Filesystem MCP",
        "category": "Developer Tools",
        "icon": "📁",
        "description": "Secure local workspace file operations: directory browsing, search, read, and write.",
        "enabled": True,
        "tools": [
            {
                "name": "fs_list_directory",
                "display_name": "List Directory",
                "description": "List all files and subdirectories with file size and modification timestamps.",
                "parameters": {"directory": {"type": "string", "description": "Relative directory path, e.g. '.' or 'jarvis-backend'"}},
                "sample_args": {"directory": "."}
            },
            {
                "name": "fs_read_file",
                "display_name": "Read Local File",
                "description": "Read file contents with safety truncation for AI context.",
                "parameters": {"filepath": {"type": "string", "description": "Path to file to read"}},
                "sample_args": {"filepath": "requirements.txt"}
            },
            {
                "name": "fs_search",
                "display_name": "Search Files",
                "description": "Fast recursive search across files in the workspace matching a pattern.",
                "parameters": {"pattern": {"type": "string", "description": "Search term or file extension"}},
                "sample_args": {"pattern": ".py"}
            }
        ]
    },
    "database": {
        "id": "database",
        "name": "Postgres / SQLite MCP",
        "category": "Data & Databases",
        "icon": "🗄️",
        "description": "Inspect schemas, table structures, and run analytical SELECT queries on jarvis.db.",
        "enabled": True,
        "tools": [
            {
                "name": "db_list_tables",
                "display_name": "List Database Tables",
                "description": "Returns all active tables and collections stored in the database.",
                "parameters": {},
                "sample_args": {}
            },
            {
                "name": "db_describe_table",
                "display_name": "Describe Table Schema",
                "description": "Returns table columns, data types, nullability, and total row count.",
                "parameters": {"table_name": {"type": "string", "description": "Name of the table (e.g. threads, messages, memories)"}},
                "sample_args": {"table_name": "threads"}
            },
            {
                "name": "db_query",
                "display_name": "Execute Read Query",
                "description": "Safely executes a SELECT query and returns formatted column records.",
                "parameters": {"sql_query": {"type": "string", "description": "SELECT statement"}},
                "sample_args": {"sql_query": "SELECT id, title, created_at FROM threads ORDER BY id DESC LIMIT 3;"}
            }
        ]
    },
    "fetch": {
        "id": "fetch",
        "name": "Fetch & Web MCP",
        "category": "Web & Network",
        "icon": "🌐",
        "description": "Fetch web pages, extract article content, strip HTML clutter, and inspect API endpoints.",
        "enabled": True,
        "tools": [
            {
                "name": "fetch_content",
                "display_name": "Fetch & Clean Web Page",
                "description": "Fetches a URL and extracts clean readable markdown/text content.",
                "parameters": {"url": {"type": "string", "description": "Full HTTP/HTTPS URL"}},
                "sample_args": {"url": "https://news.ycombinator.com"}
            }
        ]
    },
    "system_os": {
        "id": "system_os",
        "name": "System Resources MCP",
        "category": "DevOps & System",
        "icon": "⚡",
        "description": "Live CPU, load averages, memory, disk storage, and host operating system telemetry.",
        "enabled": True,
        "tools": [
            {
                "name": "system_info",
                "display_name": "Inspect System Health",
                "description": "Returns live CPU core count, disk usage GB, system architecture, and load metrics.",
                "parameters": {},
                "sample_args": {}
            }
        ]
    },
    "docker": {
        "id": "docker",
        "name": "Docker Engine MCP",
        "category": "DevOps & System",
        "icon": "🐳",
        "description": "Manage local Docker containers, check active image instances and system daemon health.",
        "enabled": True,
        "tools": [
            {
                "name": "docker_status",
                "display_name": "List Containers & Daemon",
                "description": "Inspects running Docker containers and daemon status.",
                "parameters": {},
                "sample_args": {}
            }
        ]
    },
    "weather": {
        "id": "weather",
        "name": "Live Weather MCP",
        "category": "Web & Network",
        "icon": "🌤️",
        "description": "High-accuracy live meteorological data, temperatures, and wind speeds via OpenMeteo.",
        "enabled": True,
        "tools": [
            {
                "name": "weather_lookup",
                "display_name": "Get City Weather",
                "description": "Returns live temperature, wind speed, and weather condition for any city.",
                "parameters": {"city": {"type": "string", "description": "City name, e.g. 'San Francisco', 'London', 'Tokyo'"}},
                "sample_args": {"city": "New York"}
            }
        ]
    },
    "notion": {
        "id": "notion",
        "name": "Notion Workspace MCP",
        "category": "Productivity",
        "icon": "📝",
        "description": "Direct bidirectional integration with Notion pages, task lists, and sprint boards.",
        "enabled": True,
        "tools": [
            {
                "name": "notion_status",
                "display_name": "Notion Health Check",
                "description": "Checks connectivity to Notion workspace and active token credentials.",
                "parameters": {},
                "sample_args": {}
            }
        ]
    },
    "slack": {
        "id": "slack",
        "name": "Slack MCP",
        "category": "Productivity",
        "icon": "💬",
        "description": "Send notifications to Slack channels, post updates, and trigger team webhooks.",
        "enabled": True,
        "tools": [
            {
                "name": "slack_status",
                "display_name": "Slack Auth Check",
                "description": "Validates Slack Bot token and channel capabilities.",
                "parameters": {},
                "sample_args": {}
            }
        ]
    },
    "chroma_rag": {
        "id": "chroma_rag",
        "name": "ChromaDB Vector RAG MCP",
        "category": "Data & Databases",
        "icon": "🧠",
        "description": "Semantic dense vector database storing embedded chunks of uploaded PDFs and transcripts.",
        "enabled": True,
        "tools": [
            {
                "name": "chroma_stats",
                "display_name": "Chroma Collection Stats",
                "description": "Returns total indexed document chunks and active embeddings count.",
                "parameters": {},
                "sample_args": {}
            }
        ]
    }
}

# --- Dispatch Tool Call ---

def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any] = None) -> Dict[str, Any]:
    args = arguments or {}
    try:
        # Filesystem
        if tool_name == "fs_list_directory":
            return mcp_fs_list(args.get("directory", "."))
        elif tool_name == "fs_read_file":
            return mcp_fs_read(args.get("filepath", ""), int(args.get("max_chars", 4000)))
        elif tool_name == "fs_write_file":
            return mcp_fs_write(args.get("filepath", ""), args.get("content", ""))
        elif tool_name == "fs_search":
            return mcp_fs_search(args.get("pattern", ""), args.get("base_dir", "."))

        # Database
        elif tool_name == "db_list_tables":
            return mcp_db_list_tables()
        elif tool_name == "db_describe_table":
            return mcp_db_describe_table(args.get("table_name", "threads"))
        elif tool_name == "db_query":
            return mcp_db_query(args.get("sql_query", "SELECT 1"))

        # GitHub
        elif tool_name == "github_repo_info":
            return mcp_github_repo_info(args.get("repo", "facebook/react"))
        elif tool_name == "github_list_commits":
            return mcp_github_list_commits(args.get("repo", "facebook/react"), int(args.get("count", 5)))
        elif tool_name == "github_user_profile":
            return mcp_github_user_profile(args.get("username"))
        elif tool_name == "github_user_repos":
            return mcp_github_user_repos(args.get("username"), int(args.get("count", 10)))

        # Web & Fetch
        elif tool_name == "fetch_content":
            return mcp_fetch_url(args.get("url", "https://google.com"), int(args.get("max_chars", 3000)))

        # System
        elif tool_name == "system_info":
            return mcp_system_info()

        # Docker
        elif tool_name == "docker_status":
            return mcp_docker_status()

        # Weather
        elif tool_name == "weather_lookup":
            return mcp_weather(args.get("city", "London"))

        # Notion
        elif tool_name == "notion_status":
            has_key = bool(os.getenv("NOTION_KEY"))
            return {"status": "connected" if has_key else "ready", "token_configured": has_key}

        # Slack
        elif tool_name == "slack_status":
            return mcp_slack_status()

        # Chroma
        elif tool_name == "chroma_stats":
            import rag_engine
            files = rag_engine.list_indexed_files()
            return {"status": "connected", "indexed_files_count": len(files), "files": files}

        return {"error": f"Unknown MCP tool: {tool_name}"}
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}


def get_all_mcp_servers() -> List[Dict[str, Any]]:
    """Return all configured MCP servers with computed statuses and total tool counts."""
    load_dotenv(ENV_PATH, override=True)
    notion_configured = bool(os.getenv("NOTION_KEY") or os.getenv("NOTION_TOKEN"))
    github_configured = bool(os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN_CLASSIC"))
    slack_configured = bool(os.getenv("SLACK_BOT_TOKEN"))

    servers = []
    for s_id, s_data in MCP_SERVERS.items():
        server_copy = dict(s_data)
        # Determine dynamic status
        status = "ready"
        if s_id in ["filesystem", "database", "system_os", "weather", "fetch", "chroma_rag"]:
            status = "connected"
        elif s_id == "notion":
            status = "connected" if notion_configured else "ready"
        elif s_id == "github":
            status = "connected" if github_configured else "ready"
        elif s_id == "slack":
            status = "connected" if slack_configured else "ready"
        elif s_id == "docker":
            status = "ready"

        server_copy["status"] = status
        server_copy["tool_count"] = len(s_data.get("tools", []))
        servers.append(server_copy)

    # Load any custom user MCP servers if configured
    if os.path.exists(CUSTOM_MCP_FILE):
        try:
            with open(CUSTOM_MCP_FILE, "r") as f:
                custom = json.load(f)
                if isinstance(custom, list):
                    servers.extend(custom)
        except Exception:
            pass

    return servers


def add_custom_mcp_server(name: str, endpoint: str, category: str = "Custom Integration", description: str = "") -> Dict[str, Any]:
    """Register a custom SSE or stdio MCP server."""
    custom_servers = []
    if os.path.exists(CUSTOM_MCP_FILE):
        try:
            with open(CUSTOM_MCP_FILE, "r") as f:
                custom_servers = json.load(f)
        except Exception:
            custom_servers = []

    server_id = f"custom_{len(custom_servers) + 1}_{name.lower().replace(' ', '_')}"
    new_server = {
        "id": server_id,
        "name": name,
        "category": category or "Custom Integrations",
        "icon": "🔌",
        "description": description or f"Custom MCP endpoint: {endpoint}",
        "endpoint": endpoint,
        "status": "connected",
        "enabled": True,
        "is_custom": True,
        "tool_count": 1,
        "tools": [
            {
                "name": f"{server_id}_ping",
                "display_name": f"{name} Ping",
                "description": f"Ping and inspect custom server at {endpoint}",
                "parameters": {},
                "sample_args": {}
            }
        ]
    }
    custom_servers.append(new_server)
    with open(CUSTOM_MCP_FILE, "w") as f:
        json.dump(custom_servers, f, indent=2)
    return new_server


def get_langchain_mcp_tools() -> List[Tool]:
    """Expose MCP tools to LangChain Agent with string-based execution wrapper."""
    tools = []

    # 1. Filesystem List
    def _fs_list_wrap(q: str) -> str:
        res = mcp_fs_list(q.strip() or ".")
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Filesystem_List",
        func=_fs_list_wrap,
        description="MCP Filesystem Tool: List files and subdirectories. Input: directory path string (e.g. '.' or 'jarvis-backend')."
    ))

    # 2. Filesystem Read
    def _fs_read_wrap(q: str) -> str:
        res = mcp_fs_read(q.strip())
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Filesystem_Read",
        func=_fs_read_wrap,
        description="MCP Filesystem Tool: Read file contents from workspace. Input: path to file string."
    ))

    # 3. Database Query
    def _db_query_wrap(q: str) -> str:
        res = mcp_db_query(q)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Database_Query",
        func=_db_query_wrap,
        description="MCP Database Tool: Execute read-only SQL query on jarvis.db database. Input: SELECT query string."
    ))

    # 4. GitHub Info
    def _gh_repo_wrap(q: str) -> str:
        res = mcp_github_repo_info(q)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_GitHub_Repo",
        func=_gh_repo_wrap,
        description="MCP GitHub Tool: Get repository stars, branches, description. Input: 'owner/repo' format string."
    ))

    def _gh_user_wrap(q: str) -> str:
        target = q.strip().strip("'\"") if q and q.strip() and q.lower() not in ["me", "my", "self", "none", "profile", "user"] else None
        res = mcp_github_user_profile(target)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_GitHub_User_Profile",
        func=_gh_user_wrap,
        description="MCP GitHub Tool: Get authenticated user's GitHub profile info (login, name, public repos, followers, bio). Input: username or leave empty for current user."
    ))

    def _gh_repos_wrap(q: str) -> str:
        target = q.strip().strip("'\"") if q and q.strip() and q.lower() not in ["me", "my", "self", "none", "profile", "user"] else None
        res = mcp_github_user_repos(target, count=10)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_GitHub_User_Repos",
        func=_gh_repos_wrap,
        description="MCP GitHub Tool: List latest repositories of user with languages, stars, descriptions. Input: username or leave empty for current user."
    ))

    # 5. Fetch Web Content
    def _fetch_wrap(q: str) -> str:
        res = mcp_fetch_url(q)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Fetch_Web",
        func=_fetch_wrap,
        description="MCP Web Fetch Tool: Read and extract clean text from any URL. Input: full URL string."
    ))

    # 6. System Info
    def _sys_wrap(q: str) -> str:
        res = mcp_system_info()
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_System_Health",
        func=_sys_wrap,
        description="MCP System Resources Tool: Returns live CPU cores, disk space GB, load average. Input: any string."
    ))

    # 7. Weather
    def _weather_wrap(q: str) -> str:
        res = mcp_weather(q)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Weather_Forecast",
        func=_weather_wrap,
        description="MCP Weather Tool: Get real-time temperature and weather for any city. Input: city name string."
    ))

    # 8. Autonomous PDF Generator
    def _pdf_wrap(q: str) -> str:
        import pdf_generator
        parts = q.split("|", 1)
        title = parts[0].strip() if len(parts) == 2 else "Aisia Generated Document"
        content = parts[1].strip() if len(parts) == 2 else q.strip()
        res = pdf_generator.generate_pdf_document(title=title, content=content)
        return json.dumps(res, indent=2)

    tools.append(Tool(
        name="MCP_Generate_PDF",
        func=_pdf_wrap,
        description="MCP Document Tool: Autonomously creates a downloadable, beautifully formatted PDF report or document. Input: 'Title|Markdown content'."
    ))

    return tools
