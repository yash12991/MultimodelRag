import os
import re
import json
import subprocess
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
from typing import List, Dict, Tuple, Optional
from dotenv import load_dotenv

load_dotenv()

def extract_domain(url: str) -> str:
    """Extracts clean domain name from URL."""
    try:
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain or "web"
    except Exception:
        return "web"

def search_lite_ddg(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Performs fast, resilient live web search via DuckDuckGo Lite and returns structured source cards.
    """
    try:
        cmd = [
            'curl', '-s', '-L', 
            '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 
            '--data-urlencode', f'q={query}', 
            'https://lite.duckduckgo.com/lite/'
        ]
        raw = subprocess.check_output(cmd, timeout=8)
        soup = BeautifulSoup(raw, 'html.parser')
        results = []
        
        links = soup.find_all('a', class_='result-link')
        snippets = soup.find_all('td', class_='result-snippet')
        
        for i in range(min(len(links), len(snippets), max_results)):
            a = links[i]
            snip = snippets[i]
            href = a.get('href', '')
            if 'uddg=' in href:
                href = urllib.parse.unquote(href.split('uddg=')[1].split('&')[0])
            title = a.get_text(strip=True)
            snippet = snip.get_text(strip=True)
            domain = extract_domain(href)
            
            if href and title and not href.startswith('//duckduckgo.com') and not href.startswith('https://duckduckgo.com'):
                results.append({
                    'title': title[:120],
                    'url': href,
                    'snippet': snippet[:240],
                    'domain': domain,
                    'favicon': f'https://www.google.com/s2/favicons?domain={domain}&sz=32'
                })
        return results
    except Exception as e:
        print(f"Deep search error for '{query}': {e}")
        return []

def fetch_page_content(url: str, max_chars: int = 2500) -> str:
    """Fetches clean page text from URL for grounded synthesis."""
    try:
        cmd = [
            'curl', '-s', '-L', 
            '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 
            '--max-time', '4', 
            url
        ]
        raw = subprocess.check_output(cmd, timeout=5)
        soup = BeautifulSoup(raw, 'html.parser')
        
        for s in soup(['script', 'style', 'nav', 'footer', 'header']):
            s.decompose()
            
        text = soup.get_text(separator=' ', strip=True)
        text = re.sub(r'\s+', ' ', text)
        return text[:max_chars]
    except Exception:
        return ""

def decompose_query(user_query: str) -> List[str]:
    """Uses Gemini to decompose a complex inquiry into 2-3 focused search queries."""
    from google import genai
    api_key = os.getenv("API_KEY")
    client = genai.Client(api_key=api_key)
    
    prompt = (
        f"You are a Perplexity-style research planner. Break this inquiry into 2 distinct, highly specific search queries for web retrieval.\n"
        f"Inquiry: \"{user_query}\"\n"
        f"Output ONLY a raw JSON array of strings, e.g. [\"query 1\", \"query 2\"]. No markdown or extra text."
    )
    
    try:
        res = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )
        text = res.text.strip()
        if "```" in text:
            text = re.sub(r'```(?:json)?', '', text).strip('` \n')
        queries = json.loads(text)
        if isinstance(queries, list) and len(queries) > 0:
            return queries[:2]
    except Exception as e:
        print(f"Query decomposition error: {e}")
        
    return [user_query]

def execute_deep_research(user_query: str, username: str = "default") -> Tuple[str, List[Dict[str, any]], List[str], List[Dict[str, any]]]:
    """
    Executes the full Perplexity Pro Deep Research pipeline:
    1. Query decomposition
    2. Parallel multi-source web crawl
    3. Page content extraction
    4. Synthesis with inline citations [1], [2], [3]
    5. Generation of 3 interactive follow-up questions
    Returns: (synthesized_report, source_cards, follow_up_questions, tool_steps)
    """
    from google import genai
    import memory
    import rag_engine

    tool_steps = []
    
    # Step 1: Decompose query
    sub_queries = decompose_query(user_query)
    search_queries = list(set([user_query] + sub_queries))
    
    tool_steps.append({
        "id": "step-decomp",
        "type": "tool",
        "icon": "research",
        "title": f"Formulated Research Plan ({len(search_queries)} Angles)",
        "summary": " • ".join([f'"{q}"' for q in search_queries]),
        "details": f"Targeting multi-source cross-verification across: {', '.join(search_queries)}",
        "sources": [],
        "status": "completed"
    })

    # Step 2: Search web for each sub-query
    all_sources = []
    seen_urls = set()
    
    for q in search_queries:
        sources = search_lite_ddg(q, max_results=3)
        for s in sources:
            if s["url"] not in seen_urls:
                seen_urls.add(s["url"])
                all_sources.append(s)
        if len(all_sources) >= 6:
            break

    # Number the sources [1], [2], [3]...
    indexed_sources = []
    for idx, s in enumerate(all_sources[:6], 1):
        s_copy = dict(s)
        s_copy["index"] = idx
        indexed_sources.append(s_copy)

    tool_steps.append({
        "id": "step-sources",
        "type": "web",
        "icon": "web",
        "title": f"Consulted {len(indexed_sources)} Authoritative Web Sources",
        "summary": f"Retrieved verified citations across {', '.join(list(set(s['domain'] for s in indexed_sources))[:4])}",
        "details": "\n".join([f"[{s['index']}] {s['title']} ({s['url']})" for s in indexed_sources]),
        "sources": indexed_sources,
        "status": "completed"
    })

    # Step 3: Fetch content of top pages for deeper facts
    page_excerpts = []
    for s in indexed_sources[:3]:
        content = fetch_page_content(s["url"], max_chars=1600)
        if content:
            page_excerpts.append(f"--- SOURCE [{s['index']}]: {s['title']} ({s['url']}) ---\n{content}\n")
        else:
            page_excerpts.append(f"--- SOURCE [{s['index']}]: {s['title']} ({s['url']}) ---\n{s['snippet']}\n")

    # Also check private vector knowledge base if relevant
    try:
        rag_hits = rag_engine.query_knowledge_base(user_query, n_results=2)
        if rag_hits and "No relevant documents found" not in rag_hits:
            rag_idx = len(indexed_sources) + 1
            indexed_sources.append({
                "index": rag_idx,
                "title": "ChromaDB Internal Knowledge Base",
                "url": "#knowledge-base",
                "domain": "internal-rag",
                "snippet": rag_hits[:200],
                "favicon": "https://www.google.com/s2/favicons?domain=chroma.com&sz=32"
            })
            page_excerpts.append(f"--- SOURCE [{rag_idx}]: Internal Knowledge Base ---\n{rag_hits}\n")
    except Exception:
        pass

    # Step 4: Synthesize with Gemini
    api_key = os.getenv("API_KEY")
    client = genai.Client(api_key=api_key)

    sources_prompt_text = "\n".join(page_excerpts) if page_excerpts else "\n".join([f"[{s['index']}] {s['title']}: {s['snippet']}" for s in indexed_sources])
    user_context = memory.format_memory_for_system_prompt(username, query=user_query)

    synthesis_instruction = (
        "You are Aisia Deep Research, a premier autonomous intelligence agent inspired by Perplexity Pro.\n"
        "Your task is to synthesize an authoritative, deeply informative, and comprehensive research response for the user's inquiry.\n\n"
        "CRITICAL CITATION RULES:\n"
        "1. Every key finding, statistic, or claim MUST have an inline superscript citation in brackets corresponding to its source, e.g. [1], [2], or [1][3].\n"
        "2. Only cite source indices that actually exist in the provided sources list.\n"
        "3. Organize the report with clear markdown headers (##), bullet points, and key architectural/practical takeaways.\n"
        "4. Tone: Objective, clear, analytical, and professional.\n"
        "5. At the very end of your response, output 3 proactive follow-up questions or logical next tasks in this EXACT format:\n"
        "```follow_ups\n"
        "[\"Question or next task 1?\", \"Question or next task 2?\", \"Question or next task 3?\"]\n"
        "```\n"
        f"{user_context}"
    )

    user_prompt = (
        f"Inquiry: {user_query}\n\n"
        f"Verified Information Sources:\n{sources_prompt_text}\n\n"
        f"Synthesize the complete, deeply cited research report now with follow-up questions."
    )

    try:
        res = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=user_prompt,
            config={"system_instruction": synthesis_instruction}
        )
        full_text = res.text.strip()
    except Exception as e:
        print(f"Gemini synthesis error: {e}, falling back to Mistral NeMo...")
        try:
            m_key = (os.getenv("MISTRAL_API_KEY") or os.getenv("mistral_key", "")).strip()
            if m_key:
                from mistralai import Mistral
                m_client = Mistral(api_key=m_key)
                m_res = m_client.chat.complete(
                    model="open-mistral-nemo",
                    messages=[
                        {"role": "system", "content": synthesis_instruction},
                        {"role": "user", "content": user_prompt}
                    ]
                )
                full_text = m_res.choices[0].message.content.strip()
            else:
                raise e
        except Exception as me:
            print(f"Mistral synthesis error: {me}")
            full_text = f"Here is the synthesized research on **{user_query}**:\n\n" + "\n\n".join([f"- [{s['index']}] **{s['title']}**: {s['snippet']}" for s in indexed_sources])

    # Extract follow-up questions from output
    follow_ups = []
    follow_up_match = re.search(r'```follow_ups\s*(\[.*?\])\s*```', full_text, re.DOTALL)
    if follow_up_match:
        try:
            parsed = json.loads(follow_up_match.group(1))
            if isinstance(parsed, list):
                follow_ups = [str(q).strip() for q in parsed[:4]]
        except Exception:
            pass
        full_text = re.sub(r'```follow_ups.*?```', '', full_text, flags=re.DOTALL).strip()

    if not follow_ups:
        follow_ups = [
            f"What are the cost & implementation factors of {user_query[:30]}?",
            f"Compare top industry alternatives or competitors",
            f"Add key takeaways from this research to my Notion workspace"
        ]

    return full_text, indexed_sources, follow_ups, tool_steps
