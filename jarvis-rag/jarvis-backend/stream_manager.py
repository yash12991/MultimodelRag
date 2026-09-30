import os
import re
import json
import base64
import asyncio
import uuid
from typing import AsyncGenerator, Optional, List, Dict
from dotenv import load_dotenv

load_dotenv("/Users/yashsonawane/Advance structural /.env")

import agent
import edge_tts
import memory

LANGUAGE_NATIVE_VOICES = {
    "hi-IN": "hi-IN-SwaraNeural",
    "hi": "hi-IN-SwaraNeural",
    "mr-IN": "mr-IN-AarohiNeural",
    "mr": "mr-IN-AarohiNeural",
    "es-ES": "es-ES-ElviraNeural",
    "es": "es-ES-ElviraNeural",
    "fr-FR": "fr-FR-DeniseNeural",
    "fr": "fr-FR-DeniseNeural",
    "de-DE": "de-DE-KatjaNeural",
    "de": "de-DE-KatjaNeural",
    "ja-JP": "ja-JP-NanamiNeural",
    "ja": "ja-JP-NanamiNeural",
    "zh-CN": "zh-CN-XiaoxiaoNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ar-SA": "ar-SA-ZariyahNeural",
    "ar": "ar-SA-ZariyahNeural",
    "ru-RU": "ru-RU-SvetlanaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "pt-BR": "pt-BR-FranciscaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "it-IT": "it-IT-ElsaNeural",
    "it": "it-IT-ElsaNeural",
    "ta-IN": "ta-IN-PallaviNeural",
    "ta": "ta-IN-PallaviNeural",
    "te-IN": "te-IN-ShrutiNeural",
    "te": "te-IN-ShrutiNeural",
    "bn-IN": "bn-IN-TanishaaNeural",
    "bn": "bn-IN-TanishaaNeural",
    "en-US": "en-US-AvaNeural",
    "en": "en-US-AvaNeural",
}

def clean_text_for_tts(text: str) -> str:
    """Prepares text for flawless, crystal-clear neural speech across all languages without artifacts or stutter."""
    import unicodedata
    # 1. Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # 2. Extract markdown link labels [label](url) -> label
    text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
    # 3. Strip markdown syntax symbols
    text = re.sub(r'[*_~`#><|]', '', text)
    
    # 4. Filter while preserving all human alphabets, diacritics, vowel signs, and punctuation
    cleaned_chars = []
    for ch in text:
        cat = unicodedata.category(ch)
        # L = Letters, N = Numbers, P = Punctuation, M = Combining Marks (matras/accents), Z = Separators
        if cat.startswith(('L', 'N', 'P', 'M', 'Z')) or ch in ' \t\n':
            cleaned_chars.append(ch)
    clean = ''.join(cleaned_chars)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def resolve_voice_for_text(text: str, default_voice: str = "en-US-AvaNeural", requested_lang: str = "en-US") -> str:
    """
    Intelligently routes text to native neural voice based on language and script detection:
    - Hindi / Sanskrit / Devanagari: hi-IN-SwaraNeural
    - Marathi: mr-IN-AarohiNeural (or hi-IN-SwaraNeural)
    - Japanese: ja-JP-NanamiNeural
    - Chinese: zh-CN-XiaoxiaoNeural
    - Arabic: ar-SA-ZariyahNeural
    - Russian / Cyrillic: ru-RU-SvetlanaNeural
    - Korean: ko-KR-SunHiNeural
    - Tamil: ta-IN-PallaviNeural
    - Telugu: te-IN-ShrutiNeural
    - Bengali: bn-IN-TanishaaNeural
    - Spanish: es-ES-ElviraNeural
    - French: fr-FR-DeniseNeural
    - German: de-DE-KatjaNeural
    - Italian: it-IT-ElsaNeural
    - Portuguese: pt-BR-FranciscaNeural
    """
    # 1. Script checks in generated text (highest priority)
    if re.search(r'[\u0900-\u097F]', text):  # Devanagari (Hindi/Marathi)
        if requested_lang and requested_lang.startswith("mr"):
            return "mr-IN-AarohiNeural"
        return "hi-IN-SwaraNeural"
    if re.search(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]', text):  # Japanese
        return "ja-JP-NanamiNeural"
    if re.search(r'[\u4E00-\u9FFF]', text):  # Chinese
        return "zh-CN-XiaoxiaoNeural"
    if re.search(r'[\u0600-\u06FF]', text):  # Arabic
        return "ar-SA-ZariyahNeural"
    if re.search(r'[\u0400-\u04FF]', text):  # Russian / Cyrillic
        return "ru-RU-SvetlanaNeural"
    if re.search(r'[\uAC00-\uD7AF]', text):  # Korean
        return "ko-KR-SunHiNeural"
    if re.search(r'[\u0B80-\u0BFF]', text):  # Tamil
        return "ta-IN-PallaviNeural"
    if re.search(r'[\u0C00-\u0C7F]', text):  # Telugu
        return "te-IN-ShrutiNeural"
    if re.search(r'[\u0980-\u09FF]', text):  # Bengali
        return "bn-IN-TanishaaNeural"
    
    # 2. If user specifically requested non-English language
    if requested_lang and requested_lang in LANGUAGE_NATIVE_VOICES:
        return LANGUAGE_NATIVE_VOICES[requested_lang]
    if requested_lang and requested_lang.split("-")[0] in LANGUAGE_NATIVE_VOICES:
        return LANGUAGE_NATIVE_VOICES[requested_lang.split("-")[0]]

    # 3. Default voice
    return default_voice or "en-US-AvaNeural"

async def synthesize_sentence_audio(
    text: str, 
    voice: str = "en-US-AvaNeural", 
    rate: str = "+0%",
    language: str = "en-US",
    pitch: str = "+0Hz"
) -> str:
    clean = clean_text_for_tts(text)
    if not clean:
        return ""
    
    actual_voice = resolve_voice_for_text(clean, voice or "en-US-AvaNeural", requested_lang=language)
    try:
        comm = edge_tts.Communicate(clean, actual_voice, rate=rate, pitch=pitch)
        audio = b""
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        if audio:
            return base64.b64encode(audio).decode("utf-8")
        return ""
    except Exception as e:
        print(f"Error synthesizing audio with {actual_voice}: {e}")
        return ""



def auto_extract_memories(username: str, query: str):
    """Detects and saves key user facts/memories autonomously."""
    q = query.strip()
    lower = q.lower()
    
    # "remember that <fact>" or "remember <fact>"
    if "remember that " in lower or "remember " in lower:
        fact = re.sub(r'(?i)^.*remember\s+(that\s+)?', '', q).strip()
        if len(fact) > 3:
            memory.save_user_memory(username, f"fact_{int(asyncio.get_event_loop().time())}", fact)
            return
            
    # "my name is <name>"
    if "my name is " in lower:
        name_match = re.search(r'(?i)my name is\s+([A-Za-z0-9_\- ]+)', q)
        if name_match:
            memory.save_user_memory(username, "user_name", name_match.group(1).strip())
            return
            
    # "i am a <profession>" or "i am an <profession>"
    if "i am a " in lower or "i am an " in lower:
        prof_match = re.search(r'(?i)i am an?\s+([A-Za-z0-9_\- ]+)', q)
        if prof_match:
            memory.save_user_memory(username, "profession", prof_match.group(1).strip())
            return

async def stream_agent_events(
    query: str, 
    voice: str = "en-US-AvaNeural", 
    rate: str = "+0%",
    pitch: str = "+0Hz",
    persona: str = "empathetic",
    username: str = "default",
    thread_id: str = "default",
    attachments: Optional[List[dict]] = None,
    model_name: str = "gemini-3.5-flash-lite",
    language: str = "en-US",
    agent_mode: str = "general"
) -> AsyncGenerator[str, None]:
    """
    Yields SSE formatted data lines with persistent memory & multilingual native speech:
    - Saves user message to SQLite DB under thread_id
    - Multimodal support: decodes base64 attachments for Gemini vision/document parsing
    - Loads past conversation context for this specific thread
    - Streams tokens & sentence-by-sentence audio in native language with emotion & persona controls
    - Saves assistant reply to SQLite DB under thread_id
    """
    from google import genai
    from google.genai import types
    voice = voice or "en-US-AvaNeural"
    username = username or "default"
    thread_id = thread_id or "default"
    language = language or "en-US"
    pitch = pitch or "+0Hz"
    persona = persona or "empathetic"
    
    # 1. Save user query to persistent memory and detect long-term facts
    memory.save_chat_message(username, "user", query, thread_id=thread_id, attachments=attachments)
    auto_extract_memories(username, query)
    
    # 2. Check for Long-Term Memory Recall and emit Perplexity-style badge
    user_memories = memory.get_user_memories(username)
    if user_memories:
        q_lower = query.lower()
        matched_mems = [m for m in user_memories if m["key"].lower() in q_lower or any(word in q_lower for word in m["value"].lower().split() if len(word) > 3)]
        active_mems = matched_mems if matched_mems else user_memories[:3]
        
        summary_val = f'"{active_mems[0]["value"]}"' if len(active_mems) == 1 else f'"{active_mems[0]["value"]}" (+{len(active_mems)-1} facts)'
        mem_step = {
            "id": f"step-mem-{uuid.uuid4()}",
            "type": "memory",
            "icon": "🧠",
            "title": "Recalled from Long-Term Memory",
            "summary": summary_val,
            "details": "\n".join([f"• {m['key']}: {m['value']}" for m in user_memories]),
            "sources": [{"title": "User Facts & Profile (SQLite Memory)", "domain": "local_db"}],
            "status": "completed"
        }
        yield f"data: {json.dumps({'type': 'tool_step', 'step': mem_step})}\n\n"
        await asyncio.sleep(0.02)

    # 3. Perplexity Pro Deep Research & Multi-Action Autonomous Engine
    import deep_research

    is_deep_research = (
        agent_mode == "deep_research" or
        any(k in query.lower() for k in [
            "deep research", "research on", "research about", "compare", 
            "market analysis", "investigate", "in-depth", "what are the differences",
            "literature review", "state of the art", "pros and cons of"
        ])
    )

    if is_deep_research:
        yield f"data: {json.dumps({'type': 'status', 'message': '🧠 Formulating research plan and sub-queries...'})}\n\n"
        await asyncio.sleep(0.05)
        
        reply, sources, follow_ups, tool_steps = await asyncio.to_thread(
            deep_research.execute_deep_research, query, username
        )
        
        # Multi-Action Autonomous Chaining (e.g. Research + Notion Task / Page creation)
        if "notion" in query.lower() and ("add" in query.lower() or "save" in query.lower() or "create" in query.lower() or "sync" in query.lower()):
            yield f"data: {json.dumps({'type': 'status', 'message': '📝 Syncing research brief to Notion workspace...'})}\n\n"
            try:
                import notion_tools
                task_title = f"Research: {query[:45]}"
                notion_res = notion_tools.add_task_to_notion(task_title)
                tool_steps.append({
                    "id": "step-notion-chained",
                    "type": "notion",
                    "icon": "📝",
                    "title": f'Synced to Notion: "{task_title}"',
                    "summary": "1 task/brief created in workspace",
                    "details": str(notion_res),
                    "sources": [{"title": "Notion Workspace", "url": "https://notion.so", "domain": "notion.so"}],
                    "status": "completed"
                })
                reply += f"\n\n---\n✅ *Autonomously synced task to Notion: **{task_title}***"
            except Exception as e:
                print(f"Chained Notion action error: {e}")

        # Stream research badges
        for step in tool_steps:
            yield f"data: {json.dumps({'type': 'tool_step', 'step': step})}\n\n"
            await asyncio.sleep(0.02)

        # Stream Perplexity-style source cards
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # Stream report tokens progressively
        words = reply.split(" ")
        for i in range(0, len(words), 3):
            sub = " ".join(words[i:i+3]) + " "
            yield f"data: {json.dumps({'type': 'token', 'content': sub})}\n\n"
            await asyncio.sleep(0.01)

        # Stream voice audio for executive summary (non-blocking)
        sentences = [s.strip() for s in re.split(r'(?<=[.!?\n])\s+', reply) if s.strip() and not s.startswith('#') and not s.startswith('-') and len(s) > 15][:2]
        if not sentences and reply.strip():
            first_line = reply.strip().split('\n')[0]
            if len(first_line) > 2 and not first_line.startswith(('#', '-', '*')):
                sentences = [first_line[:200]]

        for sentence in sentences:
            try:
                audio_b64 = await synthesize_sentence_audio(sentence, voice, rate, language=language, pitch=pitch)
                if audio_b64:
                    yield f"data: {json.dumps({'type': 'audio', 'sentence': sentence, 'audio': audio_b64})}\n\n"
            except Exception:
                pass

        # Stream interactive follow-up questions
        if follow_ups:
            yield f"data: {json.dumps({'type': 'follow_ups', 'follow_ups': follow_ups})}\n\n"

        # Save to persistent SQLite memory
        memory.save_chat_message(username, "model", reply, thread_id=thread_id, sources=sources, follow_ups=follow_ups)

        yield f"data: {json.dumps({'type': 'done', 'reply': reply, 'sources': sources, 'follow_ups': follow_ups, 'tool_steps': tool_steps})}\n\n"
        return

    # 4. Standard Workspace Tool Execution Path (Notion, Weather, Calendar, Files, etc.)
    if agent.needs_tool_execution(query):
        yield f"data: {json.dumps({'type': 'status', 'message': 'Consulting tools & workspace...'})}\n\n"
        reply, tool_steps = await asyncio.to_thread(agent.chat_with_agent, query, return_steps=True)
        
        # Stream tool execution steps immediately
        for step in tool_steps:
            yield f"data: {json.dumps({'type': 'tool_step', 'step': step})}\n\n"
            await asyncio.sleep(0.01)
        
        # Save reply to persistent SQLite memory
        memory.save_chat_message(username, "model", reply, thread_id=thread_id)
        
        # Stream tokens with fast progressive pacing
        words = reply.split(" ")
        for i in range(0, len(words), 3):
            sub = " ".join(words[i:i+3]) + " "
            yield f"data: {json.dumps({'type': 'token', 'content': sub})}\n\n"
            await asyncio.sleep(0.005)
            
        # Synthesize conversational speech without stalling
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', reply) if s.strip() and not s.startswith(('#', '-', '*', '<', '{', '/'))][:2]
        if not sentences and reply.strip():
            first_line = reply.strip().split('\n')[0]
            if len(first_line) > 2 and not first_line.startswith(('#', '-', '*', '<', '{', '/')):
                sentences = [first_line[:200]]

        for sentence in sentences:
            try:
                audio_b64 = await synthesize_sentence_audio(sentence, voice, rate, language=language, pitch=pitch)
                if audio_b64:
                    yield f"data: {json.dumps({'type': 'audio', 'sentence': sentence, 'audio': audio_b64})}\n\n"
            except Exception:
                pass
                
        yield f"data: {json.dumps({'type': 'done', 'reply': reply, 'tool_steps': tool_steps})}\n\n"
        return

    # 3. Ultra-fast conversational streaming path with persistent multi-turn history & vision
    api_key = os.getenv("API_KEY")
    client = genai.Client(api_key=api_key)
    
    user_facts = memory.format_memory_for_system_prompt(username)

    # Build target language directive
    lang_names = {
        "hi-IN": "Hindi (हिन्दी)",
        "mr-IN": "Marathi (मराठी)",
        "es-ES": "Spanish (Español)",
        "fr-FR": "French (Français)",
        "de-DE": "German (Deutsch)",
        "ja-JP": "Japanese (日本語)",
        "zh-CN": "Chinese (中文)",
        "ar-SA": "Arabic (العربية)",
        "ru-RU": "Russian (Русский)",
        "pt-BR": "Portuguese (Português)",
        "it-IT": "Italian (Italiano)",
        "ta-IN": "Tamil (தமிழ்)",
        "te-IN": "Telugu (తెలుగు)",
        "bn-IN": "Bengali (বাংলা)",
    }
    lang_name = lang_names.get(language, "the user's language")

    persona_directives = {
        "empathetic": (
            "\nEMOTION & SPEAKING PERSONA: EMPATHETIC\n"
            "- Speak with authentic warmth, deep emotional intelligence, and validating compassion.\n"
            "- Acknowledge feelings, speak gently and unhurriedly, and offer reassuring, supportive guidance.\n"
        ),
        "professional": (
            "\nEMOTION & SPEAKING PERSONA: PROFESSIONAL\n"
            "- Speak with polished, executive authority, structured organization, and crisp precision.\n"
            "- Structure your thoughts clearly, focus on high-impact solutions, and maintain an executive advisor presence.\n"
        ),
        "witty": (
            "\nEMOTION & SPEAKING PERSONA: WITTY\n"
            "- Speak with playful cleverness, friendly humor, and charismatic charisma.\n"
            "- Keep interactions lively and entertaining while delivering genuinely smart, high-value answers.\n"
        ),
        "concise": (
            "\nEMOTION & SPEAKING PERSONA: CONCISE\n"
            "- Speak with ultra-minimalism, zero fluff, and laser precision.\n"
            "- Eliminate conversational filler and unnecessary pleasantries. Deliver core insights immediately.\n"
        )
    }

    system_instruction = (
        "You are Aisia, an ultra-responsive, fully multilingual autonomous AI agent with real human neural voice. "
        "You are fluent in all major world languages (English, Hindi, Marathi, Spanish, French, German, Japanese, Chinese, Arabic, Russian, Portuguese, Italian, Tamil, Telugu, Bengali, etc.). "
        f"CRITICAL MULTILINGUAL INSTRUCTION:\n"
        f"- The user's active spoken language is: {lang_name} ({language}).\n"
        f"- You MUST respond in fluent, authentic, native {lang_name} whenever addressed in it.\n"
        "- If speaking Hindi (हिन्दी) or Marathi (मराठी), you MUST write in pure Devanagari script (देवनागरी लिपि) "
        "so the neural voice engine speaks every syllable with crystal-clear human pronunciation. Do NOT use English alphabet for Hindi or Marathi words.\n"
        "- If the user speaks in Spanish, reply in natural native Spanish. If French, in native French. If Japanese, in natural Japanese.\n"
        "- Keep conversational spoken replies clear, natural, and punchy without unnecessary markdown or symbols.\n"
        "\nAUTHENTICATED TOOLS & LIVE ACCESS CAPABILITY:\n"
        "- You have active, authenticated live access to GitHub (via user's GitHub Personal Access Token), Notion workspace, SQLite database, and the internet.\n"
        "- You can inspect user repositories, stars, profile, commits, and workspace files.\n"
        "- NEVER say you do not have access to the internet or cannot browse GitHub in real-time, because you DO have live API access through your tools.\n"
        f"{persona_directives.get(persona.lower(), persona_directives['empathetic'])}\n"
        f"{user_facts}\n"
    )

    if agent_mode == "coding":
        system_instruction += (
            "\nCODING AGENT & ARTIFACTS MODE ACTIVE:\n"
            "- You are Aisia Coding Agent, an elite principal fullstack software engineer and UI architect.\n"
            "- When asked to build, design, or implement web apps, games, tools, components, or projects, you can provide "
            "either single-file artifacts OR complete modular multi-file projects (e.g. index.html, styles.css, app.js).\n"
            "- FOR MULTI-FILE PROJECTS: Clearly mark the filename in the very first line of each markdown code block:\n"
            "  * HTML: ```html\n  <!-- filename: index.html -->\n  ...\n  ```\n"
            "  * CSS: ```css\n  /* filename: styles.css */\n  ...\n  ```\n"
            "  * JavaScript: ```javascript\n  // filename: app.js\n  ...\n  ```\n"
            "  * Python: ```python\n  # filename: main.py\n  ...\n  ```\n"
            "- When modifying an existing project or responding to voice iteration instructions, output the complete updated code for the modified file(s) with their filename comment so the Live Canvas file tree can update instantly.\n"
            "- Always use modern premium aesthetics (dark mode, glassmorphism, responsive mobile/desktop layouts, fluid CSS animations, Inter font).\n"
            "- For workflows, sequence charts, and architectures: Use ```mermaid ... ``` diagrams.\n"
            "- For vector illustrations / icons: Use ```svg ... ```.\n"
            "- Never output placeholders, truncation, or 'insert code here'. Provide 100% complete, working, runnable code.\n"
        )
    
    yield f"data: {json.dumps({'type': 'status', 'message': 'Thinking...'})}\n\n"
    
    full_text = ""
    buffer = ""
    
    # Load recent conversation history for this thread (last 8 turns)
    recent_history = memory.get_recent_history(username, thread_id=thread_id, limit=8)
    # Exclude the message we just saved so it does not duplicate
    if recent_history and recent_history[-1]["text"] == query:
        recent_history = recent_history[:-1]
        
    contents = []
    for m in recent_history:
        role = "user" if m["sender"] == "user" else "model"
        raw_text = m["text"]
        # Compact historical code artifacts to prevent prompt bloat
        if len(raw_text) > 800 and ("```" in raw_text or "<!-- filename:" in raw_text or "/* filename:" in raw_text):
            lines = raw_text.split('\n')
            preview = '\n'.join(lines[:3])
            raw_text = f"{preview}\n... [Prior code artifact truncated for low-latency response] ...\n{lines[-1]}"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=raw_text)]))
    
    # Construct current user parts (multimodal: text + any attached images/files)
    user_parts = []
    if attachments:
        for att in attachments:
            try:
                b64data = att.get("data", "")
                if "," in b64data:
                    b64data = b64data.split(",", 1)[1]
                mime = att.get("mime", "image/png")
                raw_bytes = base64.b64decode(b64data)
                user_parts.append(types.Part.from_bytes(data=raw_bytes, mime_type=mime))
            except Exception as e:
                print(f"Attachment decode error: {e}")
                
    user_parts.append(types.Part.from_text(text=query if query else "Please analyze the attached content."))
    contents.append(types.Content(role="user", parts=user_parts))

    target_model = model_name or "gemini-3.5-flash-lite"
    if "3.8" in target_model:
        selected_model = "gemini-3.8-flash"
    elif "3.5" in target_model:
        selected_model = "gemini-3.5-flash-lite"
    elif "3.7" in target_model:
        selected_model = "gemini-3.7-flash"
    else:
        selected_model = "gemini-3.5-flash-lite"

    try:
        stream = await client.aio.models.generate_content_stream(
            model=selected_model,
            contents=contents,
            config={"system_instruction": system_instruction}
        )
        
        audio_tasks = []
        
        async for chunk in stream:
            if chunk.text:
                full_text += chunk.text
                buffer += chunk.text
                
                # Emit token immediately with zero latency (< 400ms)
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.text})}\n\n"
                
                # Only split natural sentences for voice when not in code blocks (max 2 sentences for low latency)
                if len(audio_tasks) < 2 and "```" not in buffer and "<!" not in buffer and "{" not in buffer:
                    sentences = re.split(r'(?<=[.!?])\s+', buffer)
                    if len(sentences) > 1:
                        sentence_to_play = sentences[0].strip()
                        buffer = " ".join(sentences[1:])
                        # Synthesize only conversational sentences under 180 chars, skipping code/syntax
                        if (sentence_to_play and len(sentence_to_play) > 3 and len(sentence_to_play) < 180 and 
                            not sentence_to_play.startswith(('#', '-', '*', '<', '{', '/', ';'))):
                            task = asyncio.create_task(synthesize_sentence_audio(sentence_to_play, voice, rate, language=language, pitch=pitch))
                            audio_tasks.append((sentence_to_play, task))
                            
                            # Emit any ready audio chunks without blocking token generation
                            while audio_tasks and audio_tasks[0][1].done():
                                s_text, s_task = audio_tasks.pop(0)
                                try:
                                    audio_b64 = s_task.result()
                                    if audio_b64:
                                        yield f"data: {json.dumps({'type': 'audio', 'sentence': s_text, 'audio': audio_b64})}\n\n"
                                except Exception:
                                    pass

        # Flush the final remaining sentence in buffer only if fewer than 2 sentences queued
        if len(audio_tasks) < 2:
            remaining = buffer.strip()
            if (remaining and len(remaining) > 2 and len(remaining) < 200 and 
                not remaining.startswith(('#', '-', '*', '<', '{', '/', ';', '`', '<!--', '/*'))):
                task = asyncio.create_task(synthesize_sentence_audio(remaining, voice, rate, language=language, pitch=pitch))
                audio_tasks.append((remaining, task))

        # If no sentences were created, synthesize the conversational intro
        if not audio_tasks and full_text.strip():
            candidate = full_text.strip()
            if "```" in candidate:
                candidate = candidate.split("```")[0].strip()
            if candidate and len(candidate) > 2 and len(candidate) < 200 and not candidate.startswith(('#', '-', '*', '<', '{', '/')):
                task = asyncio.create_task(synthesize_sentence_audio(candidate, voice, rate, language=language, pitch=pitch))
                audio_tasks.append((candidate, task))

        # Await and yield audio chunks with strict 2.5s timeout per chunk so it never hangs
        for s_text, s_task in audio_tasks[:2]:
            try:
                audio_b64 = await asyncio.wait_for(s_task, timeout=2.5)
                if audio_b64:
                    yield f"data: {json.dumps({'type': 'audio', 'sentence': s_text, 'audio': audio_b64})}\n\n"
            except Exception as e:
                print(f"Audio task timeout/error: {e}")

        # Save assistant response to persistent SQLite memory
        if full_text.strip():
            memory.save_chat_message(username, "model", full_text.strip(), thread_id=thread_id)
            
        # Send done event
        yield f"data: {json.dumps({'type': 'done', 'reply': full_text.strip()})}\n\n"

    except Exception as e:
        print(f"Streaming error: {e}, falling back to direct agent...")
        reply = await asyncio.to_thread(agent.chat_with_agent, query)
        memory.save_chat_message(username, "model", reply, thread_id=thread_id)
        yield f"data: {json.dumps({'type': 'token', 'content': reply})}\n\n"
        audio_b64 = await synthesize_sentence_audio(reply, voice, rate, language=language, pitch=pitch)
        if audio_b64:
            yield f"data: {json.dumps({'type': 'audio', 'sentence': reply, 'audio': audio_b64})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'reply': reply})}\n\n"
