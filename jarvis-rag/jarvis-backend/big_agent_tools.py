import os
import json
from langchain.tools import Tool
import requests
import datetime
import docker
from slack_sdk import WebClient
from github import Github

# --- Filesystem Tools ---
def read_local_file(filepath: str) -> str:
    try:
        with open(filepath, 'r') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

def write_local_file(args: str) -> str:
    # args format: "filepath|content"
    try:
        parts = args.split("|", 1)
        if len(parts) != 2: return "Error: Must format as filepath|content"
        with open(parts[0], 'w') as f:
            f.write(parts[1])
        return f"Successfully wrote to {parts[0]}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

# --- Git / GitHub Tools ---
def get_github_repo_info(repo_name: str) -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
    try:
        from github import Github, Auth
        g = Github(auth=Auth.Token(token))
        user = g.get_user()
        clean = repo_name.strip().strip("'\"").strip()
        repo = g.get_repo(clean) if "/" in clean else user.get_repo(clean)
        
        items = []
        try:
            for item in repo.get_contents("")[:20]:
                prefix = "[dir]" if item.type == "dir" else "[file]"
                items.append(f"{prefix} {item.path}")
        except Exception:
            pass
        contents_str = "\n".join(items) if items else "Empty or no root files."
        
        return (
            f"Repository: {repo.full_name}\n"
            f"URL: {repo.html_url}\n"
            f"Branch: {repo.default_branch}\n"
            f"Description: {repo.description or 'No description'}\n"
            f"Stars: {repo.stargazers_count} | Open Issues: {repo.open_issues_count}\n\n"
            f"Contents:\n{contents_str}"
        )
    except Exception as e:
        return f"Error getting repo info for '{repo_name}': {str(e)}"

def get_github_user_profile(username: str = "") -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
    try:
        import re
        g = Github(token)
        raw = username.strip().strip("'\"").strip() if username else ""
        is_valid = bool(raw and re.match(r'^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$', raw) and raw.lower() not in ["me", "my", "self", "none", "profile", "user"])
        clean = raw if is_valid else None
        user = g.get_user(clean) if clean else g.get_user()
        return f"GitHub User: {user.login} | Name: {user.name} | Bio: {user.bio} | Repos: {user.public_repos} | Followers: {user.followers} | Profile URL: {user.html_url}"
    except Exception as e:
        return f"GitHub profile error: {str(e)}"

def get_github_user_repos(username: str = "") -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
    try:
        import re
        g = Github(token)
        raw = username.strip().strip("'\"").strip() if username else ""
        is_valid = bool(raw and re.match(r'^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$', raw) and raw.lower() not in ["me", "my", "self", "none", "profile", "user"])
        clean = raw if is_valid else None
        user = g.get_user(clean) if clean else g.get_user()
        repos = user.get_repos(sort="updated")
        lines = []
        for i, r in enumerate(repos):
            if i >= 10: break
            lines.append(f"• {r.name} ({r.language or 'No lang'}): {r.description or 'No desc'} [Stars: {r.stargazers_count}] - {r.html_url}")
        return f"Top Repositories for {user.login}:\n" + "\n".join(lines)
    except Exception as e:
        return f"GitHub repos error: {str(e)}"

def push_file_to_github(args_str: str) -> str:
    """Pushes, creates, or updates a file in a GitHub repository."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
    
    repo_name = ""
    file_path = ""
    content = ""
    commit_msg = "Update file via Aisia Agent"
    branch = None

    args_str = args_str.strip()
    if args_str.startswith("{") and args_str.endswith("}"):
        try:
            data = json.loads(args_str)
            repo_name = data.get("repo") or data.get("repo_name") or ""
            file_path = data.get("path") or data.get("file_path") or ""
            content = data.get("content") or ""
            commit_msg = data.get("message") or data.get("commit_message") or commit_msg
            branch = data.get("branch")
        except Exception:
            pass
            
    if not repo_name and "|" in args_str:
        parts = args_str.split("|")
        repo_name = parts[0].strip()
        if len(parts) > 1: file_path = parts[1].strip()
        if len(parts) > 2: content = parts[2]
        if len(parts) > 3: commit_msg = parts[3].strip()
        if len(parts) > 4: branch = parts[4].strip()

    if not repo_name or not file_path:
        return "Error: Both repository name and file path are required. Format: 'repo_name|file_path|content' or JSON with 'repo', 'path', 'content'."
        
    try:
        from github import Github, Auth
        g = Github(auth=Auth.Token(token))
        user = g.get_user()
        try:
            repo = g.get_repo(repo_name) if "/" in repo_name else user.get_repo(repo_name)
        except Exception:
            clean_repo = repo_name.split("/")[-1]
            repo = user.create_repo(clean_repo, description="Repository created via Aisia Agent", auto_init=True)
        target_branch = branch or repo.default_branch or "main"
        
        try:
            existing = repo.get_contents(file_path, ref=target_branch)
            res = repo.update_file(
                path=existing.path,
                message=commit_msg,
                content=content,
                sha=existing.sha,
                branch=target_branch
            )
            sha = res["commit"].sha[:7]
            url = res["commit"].html_url
            return f"Updated `{file_path}` in `{repo.full_name}` ({target_branch}). Commit: {sha} - {url}"
        except Exception:
            res = repo.create_file(
                path=file_path,
                message=commit_msg,
                content=content,
                branch=target_branch
            )
            sha = res["commit"].sha[:7]
            url = res["commit"].html_url
            return f"Created `{file_path}` in `{repo.full_name}` ({target_branch}). Commit: {sha} - {url}"
    except Exception as e:
        return f"Error pushing file to GitHub: {str(e)}"

def create_github_repo(args_str: str) -> str:
    """Creates a new GitHub repository."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
    
    name = ""
    description = "Created by Aisia Autonomous Agent"
    private = False
    
    args_str = args_str.strip()
    if args_str.startswith("{") and args_str.endswith("}"):
        try:
            data = json.loads(args_str)
            name = data.get("name") or data.get("repo_name") or ""
            description = data.get("description", description)
            private = bool(data.get("private", False))
        except Exception:
            pass
            
    if not name and "|" in args_str:
        parts = args_str.split("|")
        name = parts[0].strip()
        if len(parts) > 1: description = parts[1].strip()
        if len(parts) > 2: private = parts[2].strip().lower() in ["true", "1", "yes", "private"]
    elif not name:
        name = args_str.strip().strip("'\"")
        
    if not name:
        return "Error: Repository name is required."
        
    try:
        from github import Github, Auth
        g = Github(auth=Auth.Token(token))
        user = g.get_user()
        repo = user.create_repo(
            name=name,
            description=description,
            private=private,
            auto_init=True
        )
        return f"Successfully created GitHub repository: `{repo.full_name}`\nURL: {repo.html_url}\nClone URL: {repo.clone_url}"
    except Exception as e:
        return f"Error creating repository '{name}': {str(e)}"

def push_project_to_github(args_str: str) -> str:
    """Pushes multiple files to a GitHub repository."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    if not token:
        return "Error: GITHUB_TOKEN environment variable is not set."
        
    try:
        data = json.loads(args_str.strip())
        repo_name = data.get("repo") or data.get("repo_name") or ""
        files = data.get("files") or []
        commit_msg = data.get("message") or "Push project files via Aisia Agent"
        branch = data.get("branch")
        create_missing = data.get("create_if_missing", True)
        
        if not repo_name or not files:
            return "Error: Both 'repo' and 'files' are required. Format: JSON with 'repo' and 'files' (list of {path, content})."
            
        from github import Github, Auth
        g = Github(auth=Auth.Token(token))
        user = g.get_user()
        
        repo = None
        try:
            repo = g.get_repo(repo_name) if "/" in repo_name else user.get_repo(repo_name)
        except Exception:
            if create_missing:
                clean_name = repo_name.split("/")[-1]
                repo = user.create_repo(name=clean_name, description=f"Autonomous project created by Aisia Agent", auto_init=True)
            else:
                return f"Error: Repository '{repo_name}' not found."
                
        target_branch = branch or repo.default_branch or "main"
        pushed = []
        for f in files:
            p = f.get("path") or f.get("name")
            c = f.get("content", "")
            if not p: continue
            try:
                existing = repo.get_contents(p, ref=target_branch)
                repo.update_file(path=existing.path, message=f"{commit_msg}: update {p}", content=c, sha=existing.sha, branch=target_branch)
                pushed.append(f"Updated `{p}`")
            except Exception:
                repo.create_file(path=p, message=f"{commit_msg}: add {p}", content=c, branch=target_branch)
                pushed.append(f"Created `{p}`")
                
        return f"Successfully pushed {len(pushed)} file(s) to GitHub repository `{repo.full_name}` ({target_branch})\n" + "\n".join(pushed) + f"\n\nRepository: {repo.html_url}"
    except Exception as e:
        return f"Error pushing project to GitHub: {str(e)}"

def git_push_local_repo(args_str: str = "Update via Aisia Agent") -> str:
    """Commits and pushes current local workspace git changes to GitHub."""
    import subprocess
    workspace_dir = "/Users/yashsonawane/Advance structural "
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN_CLASSIC")
    
    commit_msg = "Update via Aisia Agent"
    target_repo_name = ""
    branch = "main"
    
    if args_str:
        s = args_str.strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                data = json.loads(s)
                target_repo_name = data.get("repo") or data.get("repo_name") or ""
                commit_msg = data.get("message") or commit_msg
                branch = data.get("branch") or branch
            except Exception:
                pass
        elif "|" in s:
            parts = s.split("|")
            target_repo_name = parts[0].strip()
            if len(parts) > 1: commit_msg = parts[1].strip()
            if len(parts) > 2: branch = parts[2].strip()
        elif any(c in s for c in ["/", "http"]):
            target_repo_name = s
        else:
            commit_msg = s

    try:
        from github import Github, Auth
        g = Github(auth=Auth.Token(token)) if token else None
        user = g.get_user() if g else None
        username = user.login if user else "yash12991"
        author_name = user.name if (user and user.name) else username
        author_email = user.email if (user and user.email) else f"{username}@users.noreply.github.com"
        
        # 1. Initialize git repository if not already present
        git_dir = os.path.join(workspace_dir, ".git")
        if not os.path.exists(git_dir):
            subprocess.run(["git", "init", "-b", branch], cwd=workspace_dir, check=True)
            
        # 2. Configure local git user identity
        subprocess.run(["git", "config", "user.name", author_name], cwd=workspace_dir, check=True)
        subprocess.run(["git", "config", "user.email", author_email], cwd=workspace_dir, check=True)
        
        # 3. Check / Configure Remote Origin
        remote_chk = subprocess.run(["git", "remote", "get-url", "origin"], cwd=workspace_dir, capture_output=True, text=True)
        has_remote = remote_chk.returncode == 0 and bool(remote_chk.stdout.strip())
        
        chosen_repo = target_repo_name or "MultimodelRag"
        if not has_remote or target_repo_name:
            if user:
                try:
                    repo_obj = g.get_repo(chosen_repo) if "/" in chosen_repo else user.get_repo(chosen_repo)
                except Exception:
                    clean_name = chosen_repo.split("/")[-1]
                    repo_obj = user.create_repo(clean_name, description="Advanced Agentic AI Voice Assistant & RAG", auto_init=False)
            
            clean_repo_slug = chosen_repo if "/" in chosen_repo else f"{username}/{chosen_repo}"
            authed_origin = f"https://{token}@github.com/{clean_repo_slug}.git" if token else f"https://github.com/{clean_repo_slug}.git"
            
            if has_remote:
                subprocess.run(["git", "remote", "set-url", "origin", authed_origin], cwd=workspace_dir, check=True)
            else:
                subprocess.run(["git", "remote", "add", "origin", authed_origin], cwd=workspace_dir, check=True)
        
        # 4. Stage and commit
        subprocess.run(["git", "add", "."], cwd=workspace_dir, check=True)
        
        st = subprocess.run(["git", "status", "--porcelain"], cwd=workspace_dir, capture_output=True, text=True)
        if st.stdout.strip():
            msg = commit_msg.strip() or "Update via Aisia Agent"
            subprocess.run(["git", "commit", "-m", msg], cwd=workspace_dir, capture_output=True, text=True)
            
        # 5. Push to GitHub
        subprocess.run(["git", "branch", "-M", branch], cwd=workspace_dir, check=True)
        push_res = subprocess.run(["git", "push", "-u", "origin", branch], cwd=workspace_dir, capture_output=True, text=True)
        
        if push_res.returncode != 0:
            # Rebase if remote has diverging commits
            subprocess.run(["git", "pull", "--rebase", "origin", branch], cwd=workspace_dir, capture_output=True, text=True)
            push_res = subprocess.run(["git", "push", "-u", "origin", branch], cwd=workspace_dir, capture_output=True, text=True)
            
        repo_display = chosen_repo if "/" in chosen_repo else f"{username}/{chosen_repo}"
        repo_url = f"https://github.com/{repo_display}"
        
        if push_res.returncode == 0:
            return f"Successfully committed and pushed local workspace to GitHub!\nRepository: {repo_url}\nBranch: `{branch}`\nMessage: {commit_msg}"
        return f"Git push status: {push_res.stderr or push_res.stdout}"
    except Exception as e:
        return f"Error pushing local git repo: {str(e)}"


# --- Browser / Web Tools ---
def browse_website(url: str) -> str:
    try:
        # Simple requests fetcher (for actual Playwright, you'd use playwright sync_api)
        headers = {"User-Agent": "Jarvis-Agent/1.0"}
        res = requests.get(url, headers=headers, timeout=10)
        return res.text[:2000] # Return first 2000 chars of HTML
    except Exception as e:
        return f"Failed to browse {url}: {str(e)}"

# --- Utility Tools ---
def current_time_tool(query: str) -> str:
    return str(datetime.datetime.now())

def get_weather(location: str) -> str:
    try:
        # Geocoding
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1"
        geo_data = requests.get(geo_url).json()
        if not geo_data.get("results"): return "Location not found."
        lat = geo_data["results"][0]["latitude"]
        lon = geo_data["results"][0]["longitude"]
        
        # Weather
        weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        weather_data = requests.get(weather_url).json()
        cw = weather_data.get("current_weather", {})
        return f"Current weather in {location}: {cw.get('temperature')}°C, Wind: {cw.get('windspeed')} km/h"
    except Exception as e:
        return f"Weather error: {str(e)}"

def execute_sql_query(query: str) -> str:
    # Placeholder for SQLAlchemy integration
    return f"Simulated SQL Execution for: {query}. (Connect your DB string to use this)"

def control_spotify(command: str) -> str:
    return f"Simulated Spotify Command: {command}. (Requires Spotify OAuth token)"

def slack_message(args: str) -> str:
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token: return "Error: SLACK_BOT_TOKEN is missing."
    try:
        channel, text = args.split("|", 1)
        client = WebClient(token=token)
        client.chat_postMessage(channel=channel.strip(), text=text.strip())
        return f"Successfully sent message to {channel}"
    except Exception as e:
        return str(e)

def manage_docker(command: str) -> str:
    try:
        client = docker.from_env()
        if command.lower() == "list":
            containers = client.containers.list(all=True)
            return "Containers: " + ", ".join([f"{c.name} ({c.status})" for c in containers])
        return "Unsupported docker command. Try 'list'."
    except Exception as e:
        return f"Docker Error: {str(e)}. (Is docker running?)"

def generate_pdf_tool(args: str) -> str:
    """
    Autonomously generate a downloadable PDF.
    Input format: 'title|content' or simply content if title is in the first line.
    """
    try:
        import pdf_generator
        parts = args.split("|", 1)
        if len(parts) == 2:
            title = parts[0].strip()
            content = parts[1].strip()
        else:
            title = "Aisia Document Report"
            content = args.strip()
        
        res = pdf_generator.generate_pdf_document(title=title, content=content)
        if res.get("success"):
            return f"PDF Generated Successfully!\nTitle: {res['title']}\nSize: {res['size_kb']} KB\nDownload URL: {res['download_url']}\nView URL: {res['view_url']}"
        return f"Failed to generate PDF: {res.get('error')}"
    except Exception as e:
        return f"Error in PDF generation: {str(e)}"

def get_all_big_tools():
    return [
        Tool(name="ReadLocalFile", func=read_local_file, description="Reads a file from the local filesystem. Pass absolute path."),
        Tool(name="WriteLocalFile", func=write_local_file, description="Writes to a local file. Pass 'filepath|content'."),
        Tool(name="GeneratePDF", func=generate_pdf_tool, description="Generates an executive-grade downloadable PDF report or document. Input: 'Document Title|Document markdown text'. Call this whenever the user wants a PDF, report, or exportable document."),
        Tool(name="GitHubRepoInfo", func=get_github_repo_info, description="Gets info, branch, and lists files/folders in a GitHub repo. Pass repo name like 'DSAPractice', 'MultimodelRag', or 'owner/repo'."),
        Tool(name="GitHubUserProfile", func=get_github_user_profile, description="Gets the authenticated user's GitHub profile, username, bio, and repo count. Pass username or leave empty for current user."),
        Tool(name="GitHubUserRepos", func=get_github_user_repos, description="Gets latest active GitHub repositories, descriptions, and languages for the user. Pass username or leave empty for current user."),
        Tool(name="GitHubPushFile", func=push_file_to_github, description="Pushes, creates, or updates a file in a GitHub repository. Input format: 'repo_name|file_path|content' or JSON with repo, path, content, message."),
        Tool(name="GitHubPushProject", func=push_project_to_github, description="Pushes multiple project files to a GitHub repository. Input: JSON string with repo, files (list of path and content), and message."),
        Tool(name="GitHubCreateRepo", func=create_github_repo, description="Creates a new GitHub repository for the user. Input: 'repo_name|description|private' or JSON with name, description, private."),
        Tool(name="GitPushLocal", func=git_push_local_repo, description="Commits and pushes current local workspace git changes to GitHub. Can pass commit message or 'repo|message'. Auto-initializes git and sets up remote if needed."),
        Tool(name="BrowseWebsite", func=browse_website, description="Fetches the HTML of a website. Pass full URL."),
        Tool(name="CurrentTime", func=current_time_tool, description="Gets current system time."),
        Tool(name="ExecuteSQL", func=execute_sql_query, description="Executes a query on the connected database."),
        Tool(name="SpotifyControl", func=control_spotify, description="Controls spotify playback. Pass 'play', 'pause', or 'search: query'."),
        Tool(name="Weather", func=get_weather, description="Get current weather. Pass a city name."),
        Tool(name="Slack", func=slack_message, description="Send an outbound message to a Slack channel. ONLY use when user explicitly asks to post/send a message to Slack. Do NOT use for checking schedules or personal tasks."),
        Tool(name="Docker", func=manage_docker, description="Manage local Docker. Pass 'list' to see containers."),
        # Add placeholders for others requiring complex OAuth flows
        Tool(name="GoogleCalendar", func=lambda x: "Please provide google credentials.json for Calendar. Use Notion to check schedule or tasks.", description="Google Calendar lookup (requires OAuth credentials). If checking personal schedule or tasks, use Notion tools instead."),
        Tool(name="Gmail", func=lambda x: "Please provide google credentials.json for Gmail", description="Manage Gmail"),
        Tool(name="Kubernetes", func=lambda x: "Simulated K8s Action", description="Manage Kubernetes cluster"),
        Tool(name="AWS", func=lambda x: "Simulated AWS Action", description="Manage AWS resources")
    ]
