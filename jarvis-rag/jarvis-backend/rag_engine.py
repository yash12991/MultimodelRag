import os
import glob
from typing import List
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
import multimodal_ingest

def get_embeddings():
    api_key = os.getenv("API_KEY") or os.environ.get("GOOGLE_API_KEY")
    return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", google_api_key=api_key)

def init_vectorstore():
    embeddings = get_embeddings()
    return Chroma(embedding_function=embeddings, persist_directory="./chroma_db")

def index_documents() -> int:
    """
    Scans uploads directory and ingests all supported formats through the multimodal pipeline:
    - PDFs (text, tables & visual diagrams)
    - Audio recordings (transcriptions, summaries & action items)
    - Video files (scene-by-scene topic indexing)
    - Text & code documents
    """
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
        return 0

    embeddings = get_embeddings()
    documents: List[Document] = []
    
    # Supported file extensions
    supported_extensions = (
        ".pdf", ".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac", ".flac",
        ".mp4", ".mov", ".avi", ".mkv",
        ".txt", ".md", ".csv", ".json", ".py", ".ts", ".html"
    )

    all_files = [
        os.path.join("uploads", f) for f in os.listdir("uploads")
        if not f.startswith(".") and not f.endswith(".transcript.txt") and not f.endswith(".meta.json")
        and f.lower().endswith(supported_extensions)
    ]

    for file_path in all_files:
        try:
            result = multimodal_ingest.process_file_multimodal(file_path)
            for chunk in result.get("chunks", []):
                documents.append(Document(
                    page_content=chunk["content"],
                    metadata=chunk.get("metadata", {"source": os.path.basename(file_path)})
                ))
        except Exception as e:
            print(f"Error processing file {file_path}: {e}")

    if not documents:
        return 0

    # Ensure documents are adequately chunked if any single chunk exceeds 1200 chars
    splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=150)
    splits = splitter.split_documents(documents)

    try:
        vectorstore = Chroma.from_documents(
            documents=splits,
            embedding=embeddings,
            persist_directory="./chroma_db"
        )
        return len(splits)
    except Exception as e:
        print(f"Chroma indexing error: {e}")
        return len(splits)

def query_knowledge_base(query: str):
    """Queries multimodal vectorstore and returns context-rich results."""
    try:
        embeddings = get_embeddings()
        vectorstore = Chroma(embedding_function=embeddings, persist_directory="./chroma_db")
        docs = vectorstore.similarity_search(query, k=4)
        if not docs:
            return ["No relevant information found in knowledge base."]
        
        formatted_results = []
        for d in docs:
            meta = d.metadata or {}
            source = meta.get("source", "Document")
            file_type = meta.get("file_type", "doc")
            header = f"[{source.upper()} | {file_type.upper()}]"
            formatted_results.append(f"{header}\n{d.page_content}")
            
        return formatted_results
    except Exception as e:
        print(f"Error querying knowledge base: {e}")
        return [f"Knowledge base query error: {str(e)}"]
