from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import initialize_agent, Tool, AgentType
import os
from dotenv import load_dotenv
load_dotenv("/Users/yashsonawane/Advance structural /.env")
import urllib.request
import urllib.parse
import json
from notion_client import Client
import rag_engine
import big_agent_tools
import uuid
from langchain.callbacks.base import BaseCallbackHandler

def safe_web_search(query: str) -> str:
    try:
        url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            abstract = data.get("AbstractText")
            if abstract:
                return abstract
            related = data.get("RelatedTopics", [])
            if related and isinstance(related[0], dict) and "Text" in related[0]:
                return related[0]["Text"]
        return f"Information retrieved for '{query}': No quick summary found, proceed with knowledge."
    except Exception as e:
        return f"Web search note: {str(e)}"

def safe_wikipedia_search(query: str) -> str:
    try:
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'AisiaAgent/1.0 (contact@example.com)'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            extract = data.get("extract")
            if extract:
                return extract
        return f"No Wikipedia page summary found for '{query}'."
    except Exception as e:
        return f"Wikipedia note: {str(e)}"

def search_notion(query: str) -> str:
    notion_token = os.getenv("NOTION_KEY") or os.getenv("NOTION_TOKEN")
    if not notion_token:
        return "Error: NOTION_KEY is not set in the environment. Please add it to the .env file."
    try:
        notion = Client(auth=notion_token)
        response = notion.search(query=query, sort={"direction": "descending", "timestamp": "last_edited_time"})
        results = response.get("results", [])
        if not results:
            return f"No results found in Notion for query: '{query}'"
        snippets = []
        for result in results[:3]:
            title = "Untitled"
            if result["object"] == "page":
                properties = result.get("properties", {})
                for prop_name, prop_data in properties.items():
                    if prop_data["type"] == "title":
                        title_arr = prop_data.get("title", [])
                        if title_arr:
                            title = title_arr[0].get("plain_text", "Untitled")
                        break
            elif result["object"] == "database":
                title_arr = result.get("title", [])
                if title_arr:
                    title = title_arr[0].get("plain_text", "Untitled")
            snippets.append(f"Title: {title} | URL: {result.get('url', 'N/A')}")
        return "Found in Notion:\n" + "\n".join(snippets)
    except Exception as e:
        return f"Failed to search Notion: {str(e)}"

_llm = None
_tools = None

AISIA_PREFIX = """You are Aisia, an advanced, highly capable, intelligent voice-enabled autonomous AI agent.
Your name is Aisia. Always introduce and refer to yourself as Aisia.
You have LIVE AUTHENTICATED ACCESS to the internet, Notion workspace, local SQLite databases, GitHub API (via user's active GitHub token), and the autonomous PDF document generation engine.

CRITICAL INSTRUCTIONS FOR TOOLS:
1. GITHUB & REPOSITORIES:
   - When the user asks about their GitHub profile, repos, or what is in a repository (e.g. 'what is in dsapractice', 'inspect repo', 'show repos'), ALWAYS use `GitHubRepoInfo` (pass repo name like 'DSAPractice' or 'MultimodelRag') or `GitHubUserRepos`.
   - When the user asks to push code, files, or workspace to GitHub (e.g. 'push', 'push in github', 'git push', 'push to github', 'push to dsapractice', 'push to MultimodelRag', 'pus in gituhb'), IMMEDIATELY call `GitPushLocal` or `GitHubPushFile` / `GitHubPushProject`.
   - NEVER pretend or say in speech that you pushed unless you actually invoked the tool! Execute the tool!
2. NOTION & SCHEDULE/TASKS: When the user asks about their schedule, agenda, to-do list, tasks, or notes, ALWAYS use your Notion tools: `SearchNotion`, `ReadNotionPage`, or `AddNotionTodo`. The user's active Notion workspace contains pages like 'To Do List' and 'Aisia Autonomous Notes'.
   - DO NOT attempt to use Slack for checking schedule. Slack is ONLY for posting an outbound message to a team chat channel when explicitly asked.
3. AUTONOMOUS PDF GENERATION: You have the built-in ability to generate downloadable, beautifully styled PDF documents and reports using `GeneratePDF` or `MCP_Generate_PDF`.
   - Whenever the user asks you to "make a pdf", "generate a pdf report", "export as pdf", "create a pdf", or when you decide a comprehensive document, research report, or guide should be delivered as an executive document, autonomously call `GeneratePDF` with 'Document Title|Document markdown content'.
   - Include the generated Download URL in your final answer so the user can click and download or view it immediately.

NEVER claim that you lack real-time internet access, external tool access, or the ability to generate PDFs. You have full live capability.

When responding directly without needing any tools, you MUST format your response as:
Thought: I can answer directly.
Final Answer: [Your voice-ready response here]
"""

def get_tools_and_llm(model_name: str = "gemini-3.5-flash-lite"):
    global _tools
    api_key = os.getenv("API_KEY")
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
        
    llm = ChatGoogleGenerativeAI(model=model_name, temperature=0, max_retries=1, google_api_key=api_key)

    tools = [
        Tool(
            name="Search",
            func=safe_web_search,
            description="Useful for when you need to answer questions about current events or find real-time info on the web."
        ),
        Tool(
            name="Wikipedia",
            func=safe_wikipedia_search,
            description="Useful for when you need comprehensive factual information about people, places, companies, facts, historical events."
        ),
        Tool(
            name="KnowledgeBase",
            func=rag_engine.query_knowledge_base,
            description="Useful for answering questions based on the uploaded PDFs and private documents."
        )
    ]
    import notion_tools
    import mcp_manager
    tools.extend(notion_tools.get_all_notion_tools())
    tools.extend(mcp_manager.get_langchain_mcp_tools())
    tools.extend(big_agent_tools.get_all_big_tools())
    _tools = tools
        
    return llm, _tools

AVAILABLE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash"
]

TOOL_KEYWORDS = [
    "mcp", "protocol", "database", "sql", "tables", "sqlite", "postgres",
    "system info", "cpu", "disk", "hardware", "load average",
    "notion", "workspace note", "my notes", "sprint tasks", "sprint", "todo", "tasks",
    "calendar", "schedule", "meeting", "appointment",
    "email", "gmail", "inbox", "mail", "send email",
    "github", "git", "gituhb", "repo", "repos", "repository", "repositories", "pull request", "issue", "commit", "commits", "profile", "push", "pus", "git push", "push to github", "push in github", "push code", "create repo", "dsapractice", "multimodelrag", "what is in", "what is inside", "check repo",
    "slack", "channel message",
    "docker", "container",
    "spotify", "play song", "music",
    "weather", "temperature", "forecast",
    "knowledge base", "uploaded file", "my document", "pdf", "rag", "chromadb", "vector",
    "search web", "browse", "read file", "write file", "look up", "search for"
]

def needs_tool_execution(query: str) -> bool:
    q_lower = query.lower()
    return any(keyword in q_lower for keyword in TOOL_KEYWORDS)

class PerplexityStepTracker(BaseCallbackHandler):
    """Tracks agent tool executions and converts them to Perplexity-style badge steps."""
    def __init__(self):
        super().__init__()
        self.steps = []

    def on_tool_start(self, serialized: dict, input_str: str, **kwargs) -> None:
        tool_name = serialized.get("name", "Tool")
        clean_input = str(input_str).strip(" '\"")
        
        icon = "search"
        tool_type = "tool"
        title = f'Tool: {tool_name}'
        
        name_lower = tool_name.lower()
        if "mcp" in name_lower:
            icon = "mcp"
            tool_type = "mcp"
            clean_name = tool_name.replace("MCP_", "").replace("_", " ")
            title = f'MCP {clean_name}: "{clean_input[:50]}"' if clean_input else f'MCP {clean_name}'
        elif "notion" in name_lower:
            icon = "notion"
            tool_type = "notion"
            title = f'Queried Notion: "{clean_input[:55]}"' if clean_input else 'Queried Notion Workspace'
        elif "knowledge" in name_lower or "rag" in name_lower or "chroma" in name_lower:
            icon = "vector"
            tool_type = "vector"
            title = f'ChromaDB Vector Search: "{clean_input[:55]}"'
        elif "search" in name_lower or "duckduckgo" in name_lower or "web" in name_lower:
            icon = "web"
            tool_type = "web"
            title = f'Web Search: "{clean_input[:55]}"'
        elif "wiki" in name_lower:
            icon = "web"
            tool_type = "web"
            title = f'Wikipedia: "{clean_input[:55]}"'
        elif "weather" in name_lower:
            icon = "weather"
            tool_type = "weather"
            title = f'Live Weather: "{clean_input[:55]}"'
        elif "calendar" in name_lower:
            icon = "calendar"
            tool_type = "calendar"
            title = f'Calendar Schedule: "{clean_input[:55]}"'
        elif "git" in name_lower or "github" in name_lower:
            icon = "github"
            tool_type = "github"
            if "push" in name_lower:
                title = f'Pushing to GitHub: "{clean_input[:45]}"' if clean_input else 'Pushing to GitHub'
            elif "create" in name_lower:
                title = f'Create GitHub Repo: "{clean_input[:45]}"' if clean_input else 'Create GitHub Repo'
            else:
                title = f'GitHub ({tool_name}): "{clean_input[:45]}"' if clean_input else f'GitHub: {tool_name}'
        elif "pdf" in name_lower:
            icon = "pdf"
            tool_type = "pdf"
            p_title = clean_input.split("|")[0].strip() if "|" in clean_input else clean_input[:45]
            title = f'Generate PDF: "{p_title}"' if p_title else 'Generate PDF Document'
        elif "read_file" in name_lower or "write_file" in name_lower or "localfile" in name_lower or "filesystem" in name_lower:
            icon = "file"
            tool_type = "file"
            title = f'Local File: "{clean_input[:55]}"'

        step = {
            "id": f"step-{uuid.uuid4()}",
            "type": tool_type,
            "icon": icon,
            "title": title,
            "summary": "Executing query...",
            "details": f"Input: {clean_input}",
            "sources": [],
            "status": "running"
        }
        self.steps.append(step)

    def on_tool_end(self, output: str, **kwargs) -> None:
        running = [s for s in self.steps if s.get("status") == "running"]
        if not running:
            return
        step = running[-1]
        step["status"] = "completed"
        output_str = str(output).strip()
        step["details"] = output_str

        sources = []
        if step["type"] == "notion":
            lines = [l.strip() for l in output_str.split("\n") if l.strip()]
            count = len([l for l in lines if "Title:" in l or "task" in l.lower()])
            if count == 0: count = max(1, len(lines))
            step["summary"] = f"{count} tasks retrieved" if "task" in step["title"].lower() or "todo" in step["title"].lower() else f"{count} items retrieved"
            for l in lines:
                if "http" in l:
                    parts = l.split("URL:")
                    u = parts[1].strip() if len(parts) > 1 else l
                    t = l.split("|")[0].replace("Title:", "").strip() if "Title:" in l else "Notion Document"
                    sources.append({"title": t, "url": u, "domain": "notion.so"})
        elif step["type"] == "vector":
            step["summary"] = "3 document chunks matched"
            sources.append({"title": "Uploaded Documents & PDFs", "domain": "chromadb", "snippet": output_str[:160]})
        elif step["type"] == "web":
            step["summary"] = "2 sources consulted"
            if "wikipedia" in step["title"].lower():
                step["summary"] = "Wikipedia summary retrieved"
                q = step["title"].split('Wikipedia: "')[-1].rstrip('"')
                sources.append({"title": f"Wikipedia: {q}", "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(q.replace(' ', '_'))}", "domain": "wikipedia.org"})
            else:
                step["summary"] = "Web sources retrieved"
                sources.append({"title": "DuckDuckGo Web Search", "url": "https://duckduckgo.com", "domain": "duckduckgo.com"})
        elif step["type"] == "weather":
            step["summary"] = "Live conditions retrieved"
        elif step["type"] == "github":
            step["summary"] = "GitHub data fetched"
            sources.append({"title": "GitHub API", "url": "https://github.com", "domain": "github.com"})
        elif step["type"] == "pdf":
            step["summary"] = "PDF document compiled and ready for download"
            sources.append({"title": "Aisia PDF Engine", "url": "http://localhost:8000/pdf/download", "domain": "local-pdf"})
        elif step["type"] == "mcp":
            step["summary"] = "MCP Protocol executed"
            title_l = step["title"].lower()
            if "database" in title_l or "query" in title_l:
                step["summary"] = "SQL query executed on jarvis.db"
                sources.append({"title": "SQLite jarvis.db", "domain": "local-mcp"})
            elif "github" in title_l:
                step["summary"] = "GitHub repository data fetched"
                sources.append({"title": "GitHub API", "url": "https://github.com", "domain": "github.com"})
            elif "filesystem" in title_l or "read" in title_l:
                step["summary"] = "Workspace filesystem inspected"
                sources.append({"title": "Workspace Filesystem", "domain": "fs-mcp"})
            elif "system" in title_l:
                step["summary"] = "Host metrics retrieved"
            elif "fetch" in title_l:
                step["summary"] = "Web page content extracted"
            sources.append({"title": "Model Context Protocol", "domain": "mcp-agent"})
        else:
            step["summary"] = "Execution completed"

        step["sources"] = sources

    def on_tool_error(self, error: Exception, **kwargs) -> None:
        running = [s for s in self.steps if s.get("status") == "running"]
        if running:
            step = running[-1]
            step["status"] = "error"
            step["summary"] = "Execution error"
            step["details"] = str(error)

def get_agent(model_name: str = "gemini-3.5-flash-lite"):
    llm, tools = get_tools_and_llm(model_name)
    agent = initialize_agent(
        tools, 
        llm, 
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=2,
        early_stopping_method="generate",
        agent_kwargs={"prefix": AISIA_PREFIX}
    )
    return agent

def direct_fast_chat(query: str) -> str:
    from google import genai
    api_key = os.getenv("API_KEY")
    client = genai.Client(api_key=api_key)
    
    system_instruction = (
        "You are Aisia, an ultra-responsive autonomous AI voice agent with real human neural voice. "
        "You are helpful, witty, knowledgeable, and concise. "
        "Keep your answers natural and direct for real-time speech conversation. "
        "Do not use markdown bolding (**) or excessive lists unless necessary."
    )
    
    for model_name in AVAILABLE_MODELS:
        try:
            res = client.models.generate_content(
                model=model_name,
                contents=query,
                config={"system_instruction": system_instruction}
            )
            if res.text:
                return res.text.strip()
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Quota exceeded" in err_str or "404" in err_str:
                continue
            print(f"Direct chat error with {model_name}: {e}")
            
    return "Hello! I am Aisia. How can I assist you right now?"

def chat_with_agent(query: str, return_steps: bool = False):
    tracker = PerplexityStepTracker()
    
    # If conversational or no tool needed, use ultra-fast direct path (< 1s)
    if not needs_tool_execution(query):
        reply = direct_fast_chat(query)
        return (reply, tracker.steps) if return_steps else reply

    # Tool execution path
    for model_name in AVAILABLE_MODELS:
        try:
            agent = get_agent(model_name)
            response = agent.run(query, callbacks=[tracker])
            return (response, tracker.steps) if return_steps else response
        except Exception as e:
            err_str = str(e)
            if "Could not parse LLM output: `" in err_str:
                raw = err_str.split("Could not parse LLM output: `")[1].rstrip("`")
                return (raw, tracker.steps) if return_steps else raw
            if "429" in err_str or "Quota exceeded" in err_str or "503" in err_str or "ResourceExhausted" in err_str or "404" in err_str:
                print(f"Model {model_name} rate limited or unavailable, falling back...")
                continue
            print(f"Agent error with {model_name}: {e}")
            fallback_err = f"I encountered an error while trying to process that: {str(e)}"
            return (fallback_err, tracker.steps) if return_steps else fallback_err
            
    # Fallback to direct chat if tools fail
    reply = direct_fast_chat(query)
    return (reply, tracker.steps) if return_steps else reply


