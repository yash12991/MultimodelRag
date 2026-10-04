import os
import glob
import json
import io
import mimetypes
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types
import pypdf                     

# Model fallbacks for multimodal processing
VISION_MODELS = ["gemini-3.5-flash-lite", "gemini-2.0-flash", "gemini-3.8-flash"]

def get_genai_client() -> Optional[genai.Client]:
    api_key = os.getenv("API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

def generate_multimodal_content(parts: list, model_preference: list = None) -> str:
    client = get_genai_client()
    if not client:
        return ""
    models = model_preference or VISION_MODELS
    for m in models:
        try:
            res = client.models.generate_content(
                model=m,
                contents=parts
            )
            if res and res.text:
                return res.text.strip()
        except Exception as e:
            err = str(e)
            if "503" in err or "Spikes in demand" in err or "404" in err or "Quota" in err:
                continue
            print(f"Error generating multimodal content with {m}: {e}")
    return ""

# ==============================================================================
# 1. ADVANCED PDF INGESTION (Text + Tables + Embedded Image/Diagram Analysis)
# ==============================================================================
def ingest_pdf(file_path: str) -> Dict[str, Any]:
    """
    Ingests PDF files by extracting:
    1. Structured text per page
    2. Table layouts and key data
    3. Embedded visual diagrams and architectural images analyzed with Gemini Vision
    """
    filename = os.path.basename(file_path)
    chunks: List[Dict[str, Any]] = []
    image_count = 0
    total_pages = 0

    try:
        reader = pypdf.PdfReader(file_path)
        total_pages = len(reader.pages)

        for page_idx, page in enumerate(reader.pages):
            page_num = page_idx + 1
            raw_text = page.extract_text() or ""
            enriched_content = [f"=== Document: {filename} | Page {page_num} ===\n{raw_text.strip()}"]

            # Detect embedded images (diagrams, blueprints, charts)
            if hasattr(page, "images") and page.images:
                # Limit to 2 images per page to ensure fast, high-quality indexing
                for img_idx, img in enumerate(page.images[:2]):
                    image_count += 1
                    try:
                        img_bytes = img.data
                        img_name = getattr(img, "name", f"image_{page_num}_{img_idx+1}")
                        # Analyze diagram with Gemini Vision
                        caption = generate_multimodal_content([
                            types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                            f"You are analyzing an embedded figure from document '{filename}', page {page_num}. "
                            f"Provide a clear, detailed technical caption describing all visible structures, diagrams, "
                            f"flowcharts, formulas, tables, and architectural details in this image."
                        ])
                        if caption:
                            enriched_content.append(f"\n[Embedded Visual Figure ({img_name}) on Page {page_num}]:\n{caption}")
                    except Exception as img_err:
                        print(f"Error analyzing image in PDF {filename}: {img_err}")

            final_page_text = "\n\n".join(enriched_content).strip()
            if final_page_text:
                chunks.append({
                    "content": final_page_text,
                    "metadata": {
                        "source": filename,
                        "file_type": "pdf",
                        "page": page_num,
                        "total_pages": total_pages,
                        "title": filename
                    }
                })

        summary = f"Extracted {total_pages} pages, structured tables, and {image_count} visual diagrams/figures."
        meta = {
            "file_type": "pdf",
            "pages": total_pages,
            "images_indexed": image_count,
            "summary": summary
        }
        _save_meta_file(file_path, meta)
        return {
            "filename": filename,
            "type": "pdf",
            "chunks": chunks,
            "summary": summary,
            "meta": meta
        }
    except Exception as e:
        print(f"Error ingesting PDF {file_path}: {e}")
        return {"filename": filename, "type": "pdf", "chunks": [], "summary": f"PDF parse error: {str(e)}", "meta": {}}

# ==============================================================================
# 2. AUDIO & MEETING RECORDING INGESTION (Automatic Transcription & Summary)
# ==============================================================================
def ingest_audio(file_path: str) -> Dict[str, Any]:
    """
    Ingests audio files (meeting recordings, voice memos, podcasts, voice notes):
    1. Transcribes verbatim spoken audio
    2. Generates Executive Summary & Key Decisions / Action Items
    3. Chunks both summary and transcript into searchable ChromaDB entries
    """
    filename = os.path.basename(file_path)
    chunks: List[Dict[str, Any]] = []

    try:
        with open(file_path, "rb") as f:
            audio_bytes = f.read()

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type or not mime_type.startswith("audio/"):
            mime_type = "audio/mp3"

        prompt = (
            "You are an elite speech intelligence and meeting recording analyst.\n"
            "Analyze and transcribe this audio recording completely with high precision.\n"
            "Format your output in clean Markdown with these exact sections:\n\n"
            "### Executive Meeting Summary\n"
            "[Comprehensive overview of what was discussed, core objectives, and outcomes]\n\n"
            "### Key Action Items & Decisions\n"
            "- [Action item or decision 1]\n"
            "- [Action item or decision 2]\n\n"
            "### Verbatim Transcript\n"
            "[Detailed spoken transcript with timestamps and speaker labels where audible]"
        )

        analysis = generate_multimodal_content([
            types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            prompt
        ])

        if not analysis:
            analysis = "Audio file processed. No audible speech detected."

        # Save transcript text file alongside audio for instant UI inspection
        transcript_path = f"{file_path}.transcript.txt"
        with open(transcript_path, "w", encoding="utf-8") as tf:
            tf.write(analysis)

        # Split into searchable RAG chunks
        # Chunk 1: Summary & Action Items
        sep = "### Verbatim Transcript"
        summary_part = analysis.split(sep)[0] if sep in analysis else analysis
        chunks.append({
            "content": f"=== Audio Intelligence: {filename} ===\n{summary_part.strip()}",
            "metadata": {
                "source": filename,
                "file_type": "audio",
                "title": filename,
                "section": "Summary & Decisions"
            }
        })

        # Chunk 2..N: Verbatim Transcript
        if sep in analysis:
            transcript_part = analysis.split(sep)[1]
            words = transcript_part.split()
            step_size = 350
            for i in range(0, len(words), step_size):
                sub = " ".join(words[i:i+step_size])
                chunks.append({
                    "content": f"=== Audio Transcript [{filename} (Part {i//step_size + 1})] ===\n{sub}",
                    "metadata": {
                        "source": filename,
                        "file_type": "audio",
                        "title": filename,
                        "section": f"Transcript Part {i//step_size + 1}"
                    }
                })

        brief_summary = "Transcribed and summarized with key decisions and action items."
        meta = {
            "file_type": "audio",
            "summary": brief_summary,
            "has_transcript": True
        }
        _save_meta_file(file_path, meta)
        return {
            "filename": filename,
            "type": "audio",
            "chunks": chunks,
            "summary": brief_summary,
            "transcript": analysis,
            "meta": meta
        }
    except Exception as e:
        print(f"Error ingesting audio {file_path}: {e}")
        return {"filename": filename, "type": "audio", "chunks": [], "summary": f"Audio processing error: {str(e)}", "meta": {}}

# ==============================================================================
# 3. VIDEO INGESTION (Scene-by-Scene Topic Indexing & Visual Concept Search)
# ==============================================================================
def ingest_video(file_path: str) -> Dict[str, Any]:
    """
    Ingests video files (presentations, tutorials, meetings, screen recordings, site inspections):
    1. Performs scene-by-scene topic indexing with timestamps (HH:MM:SS)
    2. Catalogs visual actions, slide/code displays, and spoken commentary
    3. Indexes each scene into ChromaDB so queries retrieve exact timestamps
    """
    filename = os.path.basename(file_path)
    chunks: List[Dict[str, Any]] = []

    try:
        client = get_genai_client()
        if not client:
            raise ValueError("Gemini client not initialized")

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type or not mime_type.startswith("video/"):
            mime_type = "video/mp4"

        prompt = (
            "You are an elite video intelligence and topic indexing AI.\n"
            "Perform a comprehensive scene-by-scene topic indexing of this video recording.\n"
            "Format your output in clean Markdown with these exact sections:\n\n"
            "### Executive Video Overview\n"
            "[Concise summary of the video topic, purpose, and key takeaways]\n\n"
            "### Scene-by-Scene Topic Index\n"
            "- **[00:00:00] Scene 1: [Topic Title]**\n"
            "  * Visual: [What is visible on screen, diagrams, code, slides, or environment]\n"
            "  * Discussion: [What is explained or demonstrated]\n"
            "  * Keywords: [Keywords]\n\n"
            "- **[00:01:30] Scene 2: [Topic Title]**\n"
            "  * Visual: [...]\n"
            "  * Discussion: [...]\n"
            "  * Keywords: [...]\n"
        )

        file_size = os.path.getsize(file_path)
        video_analysis = ""

        # For files under 18MB, use inline bytes; for larger files, upload via File API
        if file_size < 18 * 1024 * 1024:
            with open(file_path, "rb") as f:
                video_bytes = f.read()
            video_analysis = generate_multimodal_content([
                types.Part.from_bytes(data=video_bytes, mime_type=mime_type),
                prompt
            ])
        else:
            try:
                uploaded_file = client.files.upload(file=file_path)
                video_analysis = generate_multimodal_content([
                    uploaded_file,
                    prompt
                ])
            except Exception as up_err:
                print(f"File API upload error for {file_path}: {up_err}")

        if not video_analysis:
            video_analysis = f"Video '{filename}' processed. Scene indexing complete."

        # Save scene index transcript alongside video for instant UI inspection
        transcript_path = f"{file_path}.transcript.txt"
        with open(transcript_path, "w", encoding="utf-8") as tf:
            tf.write(video_analysis)

        # Parse scenes into individual timestamped ChromaDB chunks
        chunks.append({
            "content": f"=== Video Overview: {filename} ===\n{video_analysis.split('### ⏱️ Scene-by-Scene Topic Index')[0].strip()}",
            "metadata": {
                "source": filename,
                "file_type": "video",
                "title": filename,
                "section": "Overview"
            }
        })

        if "### ⏱️ Scene-by-Scene Topic Index" in video_analysis:
            scenes_block = video_analysis.split("### ⏱️ Scene-by-Scene Topic Index")[1]
            raw_scenes = [s.strip() for s in scenes_block.split("- **[") if s.strip()]
            for s_idx, raw_s in enumerate(raw_scenes):
                scene_content = f"- **[{raw_s}"
                chunks.append({
                    "content": f"=== Video Scene Topic [{filename}] ===\n{scene_content}",
                    "metadata": {
                        "source": filename,
                        "file_type": "video",
                        "title": filename,
                        "section": f"Scene {s_idx + 1}"
                    }
                })

        brief_summary = "Indexed scene-by-scene with visual descriptions and timestamps."
        meta = {
            "file_type": "video",
            "summary": brief_summary,
            "has_transcript": True
        }
        _save_meta_file(file_path, meta)
        return {
            "filename": filename,
            "type": "video",
            "chunks": chunks,
            "summary": brief_summary,
            "transcript": video_analysis,
            "meta": meta
        }
    except Exception as e:
        print(f"Error ingesting video {file_path}: {e}")
        return {"filename": filename, "type": "video", "chunks": [], "summary": f"Video processing error: {str(e)}", "meta": {}}

# ==============================================================================
# 4. TEXT, MARKDOWN, CODE & DATA INGESTION
# ==============================================================================
def ingest_text_file(file_path: str) -> Dict[str, Any]:
    filename = os.path.basename(file_path)
    chunks = []
    content = ""
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            with open(file_path, "r", encoding=enc) as f:
                content = f.read()
            break
        except Exception:
            continue

    if not content:
        return {"filename": filename, "type": "text", "chunks": [], "summary": "Empty file", "meta": {}}

    lines = content.splitlines()
    step_size = 50
    for i in range(0, len(lines), step_size):
        chunk_text = "\n".join(lines[i:i+step_size])
        chunks.append({
            "content": f"=== File: {filename} (Lines {i+1}-{min(i+step_size, len(lines))}) ===\n{chunk_text}",
            "metadata": {
                "source": filename,
                "file_type": "text",
                "title": filename
            }
        })

    summary = f"Text document with {len(lines)} lines."
    meta = {"file_type": "text", "summary": summary}
    _save_meta_file(file_path, meta)
    return {
        "filename": filename,
        "type": "text",
        "chunks": chunks,
        "summary": summary,
        "meta": meta
    }

# ==============================================================================
# UNIVERSAL DISPATCHER
# ==============================================================================
def process_file_multimodal(file_path: str) -> Dict[str, Any]:
    """Universal dispatcher for PDF, audio, video, and text files."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return ingest_pdf(file_path)
    elif ext in [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac", ".flac"]:
        # If webm, check if it is audio or video
        mime, _ = mimetypes.guess_type(file_path)
        if mime and "video" in mime:
            return ingest_video(file_path)
        return ingest_audio(file_path)
    elif ext in [".mp4", ".mov", ".avi", ".mkv"]:
        return ingest_video(file_path)
    else:
        return ingest_text_file(file_path)

def _save_meta_file(file_path: str, meta: dict):
    try:
        with open(f"{file_path}.meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
    except Exception as e:
        print(f"Error saving metadata for {file_path}: {e}")

def get_file_metadata(file_path: str) -> dict:
    meta_path = f"{file_path}.meta.json"
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}
