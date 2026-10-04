import os
from dotenv import load_dotenv
load_dotenv()
from notion_client import Client
from typing import List, Dict, Any, Optional

def get_notion_client() -> Optional[Client]:
    token = os.getenv("NOTION_KEY") or os.getenv("NOTION_TOKEN")
    if not token:
        return None
    return Client(auth=token)

def find_page_by_title_or_id(notion: Client, title_or_id: str) -> Optional[Dict[str, Any]]:
    # If it looks like a UUID
    cleaned_id = title_or_id.replace("-", "").strip()
    if len(cleaned_id) == 32:
        try:
            return notion.pages.retrieve(page_id=title_or_id)
        except Exception:
            pass

    # Search for the page by title
    try:
        results = notion.search(query=title_or_id, filter={"property": "object", "value": "page"}).get("results", [])
        if results:
            return results[0]
    except Exception:
        pass
        
    # Fallback to search all
    try:
        results = notion.search(query=title_or_id).get("results", [])
        for r in results:
            if r.get("object") == "page":
                return r
    except Exception:
        pass
        
    return None

def search_notion(query: str) -> str:
    notion = get_notion_client()
    if not notion:
        return "Error: NOTION_KEY is not set in environment."
    try:
        response = notion.search(query=query, sort={"direction": "descending", "timestamp": "last_edited_time"})
        results = response.get("results", [])
        if not results:
            return f"No results found in Notion for query: '{query}'"
        snippets = []
        for result in results[:5]:
            title = "Untitled"
            if result.get("object") == "page":
                properties = result.get("properties", {})
                for _, prop_data in properties.items():
                    if prop_data.get("type") == "title":
                        title_arr = prop_data.get("title", [])
                        if title_arr:
                            title = title_arr[0].get("plain_text", "Untitled")
                        break
            elif result.get("object") == "database":
                title_arr = result.get("title", [])
                if title_arr:
                    title = title_arr[0].get("plain_text", "Untitled")
            snippets.append(f"- {title} (ID: {result.get('id')}) | URL: {result.get('url', 'N/A')}")
        return "Notion search results:\n" + "\n".join(snippets)
    except Exception as e:
        return f"Failed to search Notion: {str(e)}"

def read_notion_page(title_or_id: str) -> str:
    notion = get_notion_client()
    if not notion:
        return "Error: NOTION_KEY is not set."
    try:
        page = find_page_by_title_or_id(notion, title_or_id)
        if not page:
            return f"Could not find any Notion page matching '{title_or_id}'."
            
        page_id = page["id"]
        blocks = notion.blocks.children.list(block_id=page_id).get("results", [])
        lines = []
        for b in blocks:
            btype = b.get("type")
            if btype in b and "rich_text" in b[btype]:
                rt = b[btype]["rich_text"]
                txt = "".join([t.get("plain_text", "") for t in rt])
                if btype == "to_do":
                    checked = "✓" if b[btype].get("checked") else "○"
                    lines.append(f"{checked} {txt}")
                elif btype == "heading_1":
                    lines.append(f"# {txt}")
                elif btype == "heading_2":
                    lines.append(f"## {txt}")
                elif btype == "bulleted_list_item":
                    lines.append(f"• {txt}")
                elif txt:
                    lines.append(txt)
                    
        content = "\n".join(lines) if lines else "(Page is empty)"
        return f"Content of Notion page '{title_or_id}':\n{content}"
    except Exception as e:
        return f"Error reading Notion page: {str(e)}"

def update_notion_page(args: str) -> str:
    """
    Appends content to an existing Notion page.
    Format: 'page_title_or_id|content_to_append'
    """
    notion = get_notion_client()
    if not notion:
        return "Error: NOTION_KEY is not set."
    try:
        if "|" in args:
            parts = args.split("|", 1)
            target = parts[0].strip()
            content = parts[1].strip()
        else:
            target = "To Do List"
            content = args.strip()

        page = find_page_by_title_or_id(notion, target)
        if not page:
            # Fallback to To Do List
            page = find_page_by_title_or_id(notion, "To Do List")
            if not page:
                return f"Could not locate page '{target}' in Notion."

        page_id = page["id"]
        
        # Build paragraph blocks
        paragraphs = [p.strip() for p in content.split("\n") if p.strip()]
        children = []
        for p in paragraphs:
            children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": p}}]
                }
            })

        notion.blocks.children.append(block_id=page_id, children=children)
        return f"Successfully updated Notion page '{target}' with {len(children)} block(s)."
    except Exception as e:
        return f"Failed to update Notion page: {str(e)}"

def add_notion_todo(args: str) -> str:
    """
    Adds a To-Do checkbox item into Notion.
    Format: 'task_description' or 'task_description|page_title'
    """
    notion = get_notion_client()
    if not notion:
        return "Error: NOTION_KEY is not set."
    try:
        target_page = "To Do List"
        task_text = args.strip()
        if "|" in args:
            parts = args.split("|", 1)
            task_text = parts[0].strip()
            target_page = parts[1].strip()

        page = find_page_by_title_or_id(notion, target_page)
        if not page:
            # Try searching all
            results = notion.search(query=target_page).get("results", [])
            for r in results:
                if r.get("object") == "page":
                    page = r
                    break
        
        if not page:
            return f"Could not find page '{target_page}' to add todo."

        page_id = page["id"]
        notion.blocks.children.append(
            block_id=page_id,
            children=[
                {
                    "object": "block",
                    "type": "to_do",
                    "to_do": {
                        "rich_text": [{"type": "text", "text": {"content": task_text}}],
                        "checked": False
                    }
                }
            ]
        )
        return f"Successfully added task: '{task_text}' to Notion ({target_page})."
    except Exception as e:
        return f"Failed to add todo to Notion: {str(e)}"

def create_notion_page(args: str) -> str:
    """
    Creates a new page in Notion.
    Format: 'title|content' or 'title|content|parent_title'
    """
    notion = get_notion_client()
    if not notion:
        return "Error: NOTION_KEY is not set."
    try:
        parts = args.split("|")
        title = parts[0].strip()
        content = parts[1].strip() if len(parts) > 1 else ""
        parent_target = parts[2].strip() if len(parts) > 2 else "Welcome to Notion"

        # Find suitable parent page
        parent = find_page_by_title_or_id(notion, parent_target)
        if not parent:
            # Pick first available page
            results = notion.search().get("results", [])
            for r in results:
                if r.get("object") == "page":
                    parent = r
                    break

        if not parent:
            return "Could not find a valid parent page in Notion to nest the new page under."

        parent_id = parent["id"]
        
        children = []
        if content:
            for p in content.split("\n"):
                if p.strip():
                    children.append({
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{"type": "text", "text": {"content": p.strip()}}]
                        }
                    })

        new_page = notion.pages.create(
            parent={"page_id": parent_id},
            properties={
                "title": [{"type": "text", "text": {"content": title}}]
            },
            children=children
        )
        return f"Successfully created Notion page '{title}'! URL: {new_page.get('url', 'N/A')}"
    except Exception as e:
        return f"Failed to create Notion page: {str(e)}"

def get_all_notion_tools():
    from langchain.tools import Tool
    return [
        Tool(
            name="SearchNotion",
            func=search_notion,
            description="Searches Notion workspace for pages, databases, and notes by keyword."
        ),
        Tool(
            name="ReadNotionPage",
            func=read_notion_page,
            description="Reads and retrieves text, bullet points, and todo items from a specific Notion page."
        ),
        Tool(
            name="UpdateNotionPage",
            func=update_notion_page,
            description="Appends text or updates an existing Notion page. Input format: 'page_title_or_id|content_to_append'."
        ),
        Tool(
            name="AddNotionTodo",
            func=add_notion_todo,
            description="Adds a new to-do checkbox task to the user's Notion workspace. Input format: 'task_description' or 'task_description|page_title'."
        ),
        Tool(
            name="CreateNotionPage",
            func=create_notion_page,
            description="Creates a brand new page in the user's Notion workspace. Input format: 'title|content'."
        )
    ]
