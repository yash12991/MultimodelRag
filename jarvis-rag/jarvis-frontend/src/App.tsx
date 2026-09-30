import React, { useState, useRef, useEffect, useCallback } from 'react'
import { VoiceOrb } from './VoiceOrb'
import type { OrbThemeName } from 'orb-ui'
import CodingCanvas, { type Artifact } from './CodingCanvas'
import ChatMessageContent, { type PerplexitySource } from './components/ChatMessageContent'
import { extractArtifactsFromText } from './utils/artifactParser'

export interface ToolExecutionStep {
  id: string
  type: 'notion' | 'memory' | 'vector' | 'web' | 'weather' | 'calendar' | 'tool' | 'mcp'
  icon: string
  title: string
  summary: string
  details?: string
  sources?: { title: string; url?: string; domain?: string; snippet?: string }[]
  status?: 'running' | 'completed' | 'error'
  timestamp?: string
}

export interface MCPToolDef {
  name: string
  display_name: string
  description: string
  parameters?: Record<string, any>
  sample_args?: Record<string, any>
}

export interface MCPServer {
  id: string
  name: string
  category: string
  icon: string
  description: string
  status: 'connected' | 'ready' | 'simulated'
  tool_count: number
  enabled?: boolean
  is_custom?: boolean
  tools: MCPToolDef[]
}

interface Message {
  id: string
  sender: 'user' | 'aisia'
  text: string
  timestamp: string
  isStreaming?: boolean
  attachments?: { name: string; mime: string; data: string }[]
  toolSteps?: ToolExecutionStep[]
  sources?: PerplexitySource[]
  followUps?: string[]
}

interface Thread {
  id: string
  title: string
  created_at?: string
  updated_at?: string
}

interface DocFile {
  name: string
  size_kb: number
  modified: number
  type?: string
  type_label?: string
  icon?: string
  summary?: string
  has_transcript?: boolean
}

interface AttachmentPreview {
  name: string
  mime: string
  data: string // base64
}

const VOICE_OPTIONS = [
  { id: 'en-US-AvaNeural', name: 'Ava', desc: 'Natural & Warm Female (Default)' },
  { id: 'en-US-AriaNeural', name: 'Aria', desc: 'Crisp & Confident Female' },
  { id: 'en-US-EmmaNeural', name: 'Emma', desc: 'Gentle & Clear Female' },
  { id: 'en-US-JennyNeural', name: 'Jenny', desc: 'Warm Conversational Female' },
  { id: 'en-US-GuyNeural', name: 'Guy', desc: 'Natural & Smooth Male' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher', desc: 'Deep & Clear Male' },
  { id: 'en-GB-BrianNeural', name: 'Brian', desc: 'British Gentleman Male' },
]

const ORB_THEMES: { id: OrbThemeName; name: string; desc: string }[] = [
  { id: 'cloud', name: 'Gemini Cloud (Official)', desc: 'Official Gemini Live iridescent cloud orb' },
  { id: 'radial', name: 'Radial Glow', desc: 'Concentric audio-reactive pulses' },
  { id: 'circle', name: 'Pure Circle', desc: 'Minimalist smooth organic sphere' },
  { id: 'bars', name: 'Neural Spectrum', desc: 'Dynamic frequency spectrum' },
]

const MODEL_OPTIONS = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash', badge: 'Flash', desc: 'Low latency real-time voice & multimodality' },
  { id: 'gemini-2.5-flash', name: 'Gemini 3.7 Pro', badge: 'Pro', desc: 'Complex reasoning, coding & tool execution' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', badge: 'Lite', desc: 'Real-time conversational streaming' },
]

const LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸', label: 'EN' },
  { code: 'hi-IN', name: 'Hindi (हिन्दी)', flag: '🇮🇳', label: 'HI' },
  { code: 'mr-IN', name: 'Marathi (मराठी)', flag: '🇮🇳', label: 'MR' },
  { code: 'es-ES', name: 'Spanish (Español)', flag: '🇪🇸', label: 'ES' },
  { code: 'fr-FR', name: 'French (Français)', flag: '🇫🇷', label: 'FR' },
  { code: 'de-DE', name: 'German (Deutsch)', flag: '🇩🇪', label: 'DE' },
  { code: 'ja-JP', name: 'Japanese (日本語)', flag: '🇯🇵', label: 'JA' },
  { code: 'zh-CN', name: 'Chinese (中文)', flag: '🇨🇳', label: 'ZH' },
  { code: 'ar-SA', name: 'Arabic (العربية)', flag: '🇸🇦', label: 'AR' },
  { code: 'ru-RU', name: 'Russian (Русский)', flag: '🇷🇺', label: 'RU' },
  { code: 'pt-BR', name: 'Portuguese (Brasil)', flag: '🇧🇷', label: 'PT' },
  { code: 'it-IT', name: 'Italian (Italiano)', flag: '🇮🇹', label: 'IT' },
  { code: 'ta-IN', name: 'Tamil (தமிழ்)', flag: '🇮🇳', label: 'TA' },
  { code: 'te-IN', name: 'Telugu (తెలుగు)', flag: '🇮🇳', label: 'TE' },
  { code: 'bn-IN', name: 'Bengali (বাংলা)', flag: '🇮🇳', label: 'BN' },
]

export interface PersonaPreset {
  id: 'empathetic' | 'professional' | 'witty' | 'concise'
  name: string
  subtitle: string
  badge: string
  icon: string
  desc: string
  defaultPitch: string
  defaultRate: string
  previewSample: string
  toneTags: string[]
}

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'empathetic',
    name: 'Empathetic',
    subtitle: 'Warm, compassionate & reassuring',
    badge: 'Gentle & Calming',
    icon: '💖',
    desc: 'Validating emotional intelligence with an unhurried, soothing cadence and comforting reassurance.',
    defaultPitch: '+2Hz',
    defaultRate: '-5%',
    previewSample: "I am right here with you every step of the way. Take your time, and we will work through this together.",
    toneTags: ['Warm', 'Validating', 'Compassionate', 'Patient']
  },
  {
    id: 'professional',
    name: 'Professional',
    subtitle: 'Crisp, structured & authoritative',
    badge: 'Executive Advisor',
    icon: '💼',
    desc: 'Clear executive delivery with structured organization, objective insights, and confident cadence.',
    defaultPitch: '+0Hz',
    defaultRate: '+0%',
    previewSample: "Good day. I have analyzed your objectives and prepared a structured overview of our next strategic milestones.",
    toneTags: ['Articulate', 'Structured', 'Direct', 'Poised']
  },
  {
    id: 'witty',
    name: 'Witty',
    subtitle: 'Playful, clever & charismatic',
    badge: 'Sharp Humor',
    icon: '⚡',
    desc: 'Lively pitch modulation, clever wordplay, and charismatic energy while remaining remarkably smart.',
    defaultPitch: '+6Hz',
    defaultRate: '+5%',
    previewSample: "Well, look at us building the future and having a blast doing it! What brilliant puzzle are we cracking next?",
    toneTags: ['Playful', 'Energetic', 'Clever', 'Dynamic']
  },
  {
    id: 'concise',
    name: 'Concise',
    subtitle: 'Ultra-minimalist & high-density',
    badge: 'Zero Fluff',
    icon: '🎯',
    desc: 'Fast, efficient delivery without redundant pleasantries or filler. Immediate answers and key facts.',
    defaultPitch: '-2Hz',
    defaultRate: '+15%',
    previewSample: "Understood. Root cause isolated. Optimization applied and all system tests are passing.",
    toneTags: ['Fast', 'Minimalist', 'Direct', 'Laser-focused']
  }
]

const DEFAULT_STOPWATCH_ARTIFACT: Artifact = {
  id: 'art-welcome',
  title: 'Interactive Stopwatch Demo',
  language: 'html',
  type: 'html',
  code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, #1a1b2f, #0b0c16);
      color: #fff;
    }
    .card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      padding: 32px;
      width: 340px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    }
    h2 { font-size: 1.4rem; font-weight: 600; margin-bottom: 6px; color: #a5b4fc; }
    p { font-size: 0.85rem; color: #94a3b8; margin-bottom: 24px; }
    .display {
      font-size: 3.2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-family: monospace;
      color: #38bdf8;
      margin: 16px 0 24px 0;
      text-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
    }
    .btn-group { display: flex; gap: 10px; justify-content: center; }
    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-start { background: linear-gradient(135deg, #10b981, #059669); color: white; }
    .btn-stop { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
    .btn-reset { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }
    button:hover { transform: translateY(-2px); opacity: 0.95; }
    button:active { transform: translateY(0); }
  </style>
</head>
<body>
  <div class="card">
    <h2>Interactive Stopwatch</h2>
    <p>Live rendered preview by Coding Agent</p>
    <div class="display" id="time">00:00.00</div>
    <div class="btn-group">
      <button class="btn-start" id="toggleBtn" onclick="toggle()">Start</button>
      <button class="btn-reset" onclick="reset()">Reset</button>
    </div>
  </div>
  <script>
    let timer = null;
    let elapsed = 0;
    let running = false;
    const disp = document.getElementById('time');
    const toggleBtn = document.getElementById('toggleBtn');
    function format(ms) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const cs = Math.floor((ms % 1000) / 10);
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0');
    }
    function toggle() {
      if (running) {
        clearInterval(timer);
        running = false;
        toggleBtn.textContent = 'Start';
        toggleBtn.className = 'btn-start';
      } else {
        const start = performance.now() - elapsed;
        timer = setInterval(() => {
          elapsed = performance.now() - start;
          disp.textContent = format(elapsed);
        }, 30);
        running = true;
        toggleBtn.textContent = 'Pause';
        toggleBtn.className = 'btn-stop';
      }
    }
    function reset() {
      clearInterval(timer);
      running = false;
      elapsed = 0;
      disp.textContent = '00:00.00';
      toggleBtn.textContent = 'Start';
      toggleBtn.className = 'btn-start';
    }
  </script>
</body>
</html>`
}

export default function App() {
  // Auth state
  const [token] = useState<string | null>(localStorage.getItem('token') || 'guest_token')
  const [currentUser] = useState<string>(
    localStorage.getItem('aisia_username') || 'yash'
  )

  // Multilingual Speech Input
  const [speechLang, setSpeechLang] = useState<string>(
    localStorage.getItem('aisia_speech_lang') || 'en-US'
  )
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false)

  // Layout & Navigation
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash-lite')
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false)
  const [showToolsMenu, setShowToolsMenu] = useState<boolean>(false)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const [activeModal, setActiveModal] = useState<'none' | 'voice-call' | 'settings' | 'files' | 'notion'>('none')
  const [settingsTab, setSettingsTab] = useState<'voice' | 'persona' | 'memory' | 'integrations' | 'system'>('voice')
  
  // In-Call Messaging (ChatGPT Voice & Text Hybrid Mode)
  const [isInCallChatOpen, setIsInCallChatOpen] = useState<boolean>(false)
  const [inCallInput, setInCallInput] = useState<string>('')
  const inCallChatEndRef = useRef<HTMLDivElement>(null)
  
  // Modular Agent Mode & Live Interactive Canvas
  const [agentMode, setAgentMode] = useState<'general' | 'deep_research' | 'coding'>('general')
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)
  const [isCanvasOpen, setIsCanvasOpen] = useState<boolean>(false)

  // Threads & Chat History
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])

  // Voice & Audio Configuration
  const [selectedVoice, setSelectedVoice] = useState<string>(
    localStorage.getItem('aisia_voice') || 'en-US-AvaNeural'
  )
  const [voiceSpeed, setVoiceSpeed] = useState<string>(
    localStorage.getItem('aisia_speed') || '+0%'
  )
  const [orbTheme, setOrbTheme] = useState<OrbThemeName>(
    (localStorage.getItem('aisia_orb_theme') as OrbThemeName) || 'cloud'
  )
  const [handsFreeMode, setHandsFreeMode] = useState<boolean>(false)
  const [voiceEnabled] = useState<boolean>(true)

  // Emotion & Tone Persona Controls
  const [voicePitch, setVoicePitch] = useState<string>(
    localStorage.getItem('aisia_pitch') || '+0Hz'
  )
  const [voicePersona, setVoicePersona] = useState<'empathetic' | 'professional' | 'witty' | 'concise'>(
    (localStorage.getItem('aisia_persona') as any) || 'empathetic'
  )
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  // Live Speech & Voice Call States
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [liveTranscription, setLiveTranscription] = useState('')
  const [latencyHud, setLatencyHud] = useState('~410ms')

  // Knowledge & Notion States
  const [documents, setDocuments] = useState<DocFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [selectedDocTranscript, setSelectedDocTranscript] = useState<{ name: string; content: string } | null>(null)
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false)
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [notionPages, setNotionPages] = useState<any[]>([])
  const [notionTaskText, setNotionTaskText] = useState('')
  const [notionStatus, setNotionStatus] = useState('')
  const [savedMemories, setSavedMemories] = useState<any[]>([])
  const [newMemoryKey, setNewMemoryKey] = useState('')
  const [newMemoryVal, setNewMemoryVal] = useState('')

  // MCP Hub States
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [mcpFilter, setMcpFilter] = useState<string>('All')
  const [mcpSearch, setMcpSearch] = useState<string>('')
  const [expandedMcpId, setExpandedMcpId] = useState<string | null>(null)
  const [mcpTestRunning, setMcpTestRunning] = useState<string | null>(null)
  const [mcpTestResult, setMcpTestResult] = useState<{ [toolName: string]: any }>({})
  const [showAddMcpModal, setShowAddMcpModal] = useState<boolean>(false)
  const [newMcpName, setNewMcpName] = useState<string>('')
  const [newMcpEndpoint, setNewMcpEndpoint] = useState<string>('')
  const [newMcpCategory, setNewMcpCategory] = useState<string>('Developer Tools')
  const [newMcpDesc, setNewMcpDesc] = useState<string>('')
  const [mcpIsLoading, setMcpIsLoading] = useState<boolean>(false)

  // Refs for State Sync and Bidirectional Full-Duplex Calling
  const recognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<{ url: string; sentence: string; audio?: HTMLAudioElement }[]>([])
  const isPlayingQueueRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Synchronization refs for instant zero-latency callbacks
  const activeModalRef = useRef<'none' | 'voice-call' | 'settings' | 'files' | 'notion'>('none')
  const isSpeakingRef = useRef<boolean>(false)
  const isProcessingRef = useRef<boolean>(false)
  const isMutedRef = useRef<boolean>(false)
  const speechLangRef = useRef<string>(speechLang)
  const silenceTimerRef = useRef<any>(null)
  const accumulatedSpeechRef = useRef<string>('')
  
  // Acoustic Echo Cancellation & Self-Feedback Prevention Refs
  const lastAudioEndTimeRef = useRef<number>(0)
  const lastAisiaSpokenRef = useRef<string[]>([])

  // Semantic echo filter to detect if microphone heard Aisia's own speaker output
  const isAisiaSelfEcho = useCallback((utterance: string): boolean => {
    if (!utterance) return false
    const clean = utterance.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    if (!clean || clean.length < 3) return false
    for (const spoken of lastAisiaSpokenRef.current) {
      const cleanSpoken = spoken.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
      if (cleanSpoken.includes(clean) || clean.includes(cleanSpoken)) {
        return true
      }
      const wordsU = clean.split(/\s+/)
      const wordsS = new Set(cleanSpoken.split(/\s+/))
      const matchCount = wordsU.filter(w => wordsS.has(w)).length
      if (wordsU.length >= 3 && matchCount / wordsU.length > 0.45) {
        return true
      }
    }
    return false
  }, [])

  // Real AudioContext and AnalyserNode for true voice activity detection
  const audioContextRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  useEffect(() => { activeModalRef.current = activeModal }, [activeModal])
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { isProcessingRef.current = isProcessing }, [isProcessing])
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { speechLangRef.current = speechLang }, [speechLang])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing, liveTranscription])

  // Auto-scroll in-call chat to bottom when open
  useEffect(() => {
    if (isInCallChatOpen) {
      inCallChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isProcessing, isInCallChatOpen])

  // Load threads
  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8000/threads?username=${encodeURIComponent(currentUser)}`)
      if (res.ok) {
        const data = await res.json()
        const fetchedThreads = data.threads || []
        setThreads(fetchedThreads)
        if (fetchedThreads.length > 0 && !activeThreadId) {
          selectThread(fetchedThreads[0].id)
        }
      }
    } catch (e) {
      console.warn('Failed to load threads', e)
    }
  }, [currentUser, activeThreadId])

  // Select thread and load messages
  const selectThread = async (threadId: string) => {
    setActiveThreadId(threadId)
    try {
      const res = await fetch(`http://localhost:8000/threads/${threadId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error('Failed to load thread messages', e)
    }
  }

  // Create new thread
  const handleNewChat = async () => {
    try {
      const res = await fetch('http://localhost:8000/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, title: 'New Chat' })
      })
      if (res.ok) {
        const data = await res.json()
        const newThread = data.thread
        setThreads(prev => [newThread, ...prev])
        setActiveThreadId(newThread.id)
        setMessages([])
        if (window.innerWidth < 768) setSidebarOpen(false)
      }
    } catch (e) {
      console.error('Failed to create thread', e)
    }
  }

  // Delete thread
  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    try {
      await fetch(`http://localhost:8000/threads/${threadId}`, { method: 'DELETE' })
      setThreads(prev => prev.filter(t => t.id !== threadId))
      if (activeThreadId === threadId) {
        const remaining = threads.filter(t => t.id !== threadId)
        if (remaining.length > 0) {
          selectThread(remaining[0].id)
        } else {
          handleNewChat()
        }
      }
    } catch (e) {
      console.error('Failed to delete thread', e)
    }
  }

  // Fetch memories and documents
  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8000/memory?username=${encodeURIComponent(currentUser)}`)
      if (res.ok) {
        const data = await res.json()
        setSavedMemories(data.memories || [])
      }
    } catch (e) {
      console.warn('Failed to load memories', e)
    }
  }, [currentUser])

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (e) {
      console.warn('Failed to load docs', e)
    }
  }, [])

  const fetchNotion = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/notion/pages')
      if (res.ok) {
        const data = await res.json()
        setNotionPages(data.pages || [])
      }
    } catch (e) {
      console.warn('Failed to load Notion', e)
    }
  }, [])

  const fetchMcpServers = useCallback(async () => {
    try {
      setMcpIsLoading(true)
      const res = await fetch('http://localhost:8000/mcp/servers')
      if (res.ok) {
        const data = await res.json()
        if (data.servers) setMcpServers(data.servers)
      }
    } catch (e) {
      console.warn('Failed to load MCP servers', e)
    } finally {
      setMcpIsLoading(false)
    }
  }, [])

  const handleRunMcpTest = async (toolName: string, sampleArgs: any) => {
    setMcpTestRunning(toolName)
    try {
      const res = await fetch('http://localhost:8000/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, arguments: sampleArgs || {} })
      })
      const data = await res.json()
      setMcpTestResult(prev => ({ ...prev, [toolName]: data.result }))
    } catch (e: any) {
      setMcpTestResult(prev => ({ ...prev, [toolName]: { error: e.message } }))
    } finally {
      setMcpTestRunning(null)
    }
  }

  const handleAddCustomMcp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMcpName.trim() || !newMcpEndpoint.trim()) return
    try {
      const res = await fetch('http://localhost:8000/mcp/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMcpName.trim(),
          endpoint: newMcpEndpoint.trim(),
          category: newMcpCategory,
          description: newMcpDesc.trim()
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.server) {
          setMcpServers(prev => [...prev, data.server])
        }
        setShowAddMcpModal(false)
        setNewMcpName('')
        setNewMcpEndpoint('')
        setNewMcpDesc('')
      }
    } catch (e) {
      console.error('Failed to add custom MCP server', e)
    }
  }

  useEffect(() => {
    loadThreads()
    fetchMemories()
    fetchDocuments()
    fetchNotion()
    fetchMcpServers()
  }, [currentUser])

  // Close tools popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false)
      }
    }
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [showToolsMenu])



  // Stop active speech playback
  const stopSpeaking = useCallback(() => {
    lastAudioEndTimeRef.current = Date.now()
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    audioQueueRef.current.forEach(item => {
      try { URL.revokeObjectURL(item.url) } catch (_) {}
    })
    audioQueueRef.current = []
    isPlayingQueueRef.current = false
    setIsSpeaking(false)
    isSpeakingRef.current = false
  }, [])

  // Audio queue processor for low latency sentence streaming with preloading
  const processNextAudioInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false
      setIsSpeaking(false)
      isSpeakingRef.current = false
      lastAudioEndTimeRef.current = Date.now()
      // In voice call mode: ensure recognition is active and listening
      if (activeModalRef.current === 'voice-call' && !isMutedRef.current) {
        try {
          recognitionRef.current?.start()
        } catch (_) {}
      }
      return
    }

    isPlayingQueueRef.current = true
    setIsSpeaking(true)
    isSpeakingRef.current = true
    const nextItem = audioQueueRef.current.shift()!
    if (nextItem.sentence) {
      lastAisiaSpokenRef.current.push(nextItem.sentence.toLowerCase())
      if (lastAisiaSpokenRef.current.length > 8) {
        lastAisiaSpokenRef.current.shift()
      }
    }
    const audio = nextItem.audio || new Audio(nextItem.url)
    currentAudioRef.current = audio

    // Pre-warm the next audio chunk in memory so transition is 0ms gapless
    if (audioQueueRef.current.length > 0 && audioQueueRef.current[0].audio) {
      try {
        audioQueueRef.current[0].audio.load()
      } catch (_) {}
    }

    audio.onended = () => {
      URL.revokeObjectURL(nextItem.url)
      lastAudioEndTimeRef.current = Date.now()
      processNextAudioInQueue()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(nextItem.url)
      lastAudioEndTimeRef.current = Date.now()
      processNextAudioInQueue()
    }
    audio.play().catch(e => {
      console.warn('Playback error', e)
      lastAudioEndTimeRef.current = Date.now()
      processNextAudioInQueue()
    })
  }, [])

  const enqueueAudioChunk = useCallback((base64Data: string, sentence: string) => {
    try {
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      
      // Instantly pre-initialize Audio object to eliminate decoding latency
      const preloadedAudio = new Audio(url)
      preloadedAudio.preload = 'auto'
      preloadedAudio.load()

      audioQueueRef.current.push({ url, sentence, audio: preloadedAudio })

      if (!isPlayingQueueRef.current) {
        processNextAudioInQueue()
      }
    } catch (e) {
      console.error('Audio chunk decode error', e)
    }
  }, [processNextAudioInQueue])

  // Speech Recognition Setup (Continuous & Bidirectional Full-Duplex)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = speechLang || 'en-US'

      recognition.onstart = () => {
        setIsRecording(true)
        setStatusMessage(activeModalRef.current === 'voice-call' ? 'Listening...' : 'Listening...')
      }

      recognition.onresult = (event: any) => {
        // Acoustic Echo Cancellation Guard:
        // When Aisia is speaking through the speaker, or within 800ms after speaking ends,
        // ignore microphone input so speaker output is not fed back as user input.
        if (isSpeakingRef.current || isPlayingQueueRef.current || (Date.now() - lastAudioEndTimeRef.current < 800)) {
          return
        }

        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript
          } else {
            interim += event.results[i][0].transcript
          }
        }
        
        const currentUtterance = (final || interim).trim()
        if (!currentUtterance) return

        // Drop any self-echo of Aisia's recent speech
        if (isAisiaSelfEcho(currentUtterance)) {
          console.warn('[EchoCancellation] Dropped self-echo from speaker:', currentUtterance)
          return
        }

        setLiveTranscription(currentUtterance)
        accumulatedSpeechRef.current = currentUtterance

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
        }

        // Universal Conversational Auto-Dispatch: 950ms silence triggers auto-send
        const silenceDelay = activeModalRef.current === 'voice-call' ? 950 : 1100
        silenceTimerRef.current = setTimeout(() => {
          const toSend = accumulatedSpeechRef.current.trim()
          if (toSend && !isAisiaSelfEcho(toSend) && !isSpeakingRef.current && (Date.now() - lastAudioEndTimeRef.current >= 800)) {
            accumulatedSpeechRef.current = ''
            setLiveTranscription('')
            if (activeModalRef.current !== 'voice-call') {
              setIsRecording(false)
              try { recognitionRef.current?.stop() } catch (_) {}
            }
            setStatusMessage('Thinking...')
            handleSendMessage(toSend)
          } else {
            accumulatedSpeechRef.current = ''
            setLiveTranscription('')
          }
        }, silenceDelay)

        // If browser finalized utterance in standard chat mode, dispatch immediately
        if (final && activeModalRef.current !== 'voice-call') {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          const toSend = final.trim()
          if (toSend && !isAisiaSelfEcho(toSend) && !isSpeakingRef.current && (Date.now() - lastAudioEndTimeRef.current >= 800)) {
            accumulatedSpeechRef.current = ''
            setLiveTranscription('')
            setIsRecording(false)
            try { recognitionRef.current?.stop() } catch (_) {}
            setStatusMessage('Thinking...')
            handleSendMessage(toSend)
          } else {
            accumulatedSpeechRef.current = ''
            setLiveTranscription('')
          }
        }
      }

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('Voice recognition error:', event.error)
        }
        // In call mode, don't drop out on transient no-speech errors
        if (activeModalRef.current !== 'voice-call') {
          setIsRecording(false)
        }
      }

      recognition.onend = () => {
        // Critical: Flush any pending speech that didn't get dispatched before recognition stopped
        const pending = accumulatedSpeechRef.current.trim()
        accumulatedSpeechRef.current = ''
        setLiveTranscription('')
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

        if (pending && !isAisiaSelfEcho(pending) && !isSpeakingRef.current && (Date.now() - lastAudioEndTimeRef.current >= 800)) {
          setStatusMessage('Thinking...')
          handleSendMessage(pending)
        }

        // Continuous Reconnect: If in Voice Call and not muted, seamlessly restart listening!
        if (activeModalRef.current === 'voice-call' && !isMutedRef.current) {
          setTimeout(() => {
            try {
              if (recognitionRef.current && activeModalRef.current === 'voice-call') {
                recognitionRef.current.start()
              }
            } catch (_) {}
          }, 80)
        } else {
          setIsRecording(false)
        }
      }

      recognitionRef.current = recognition
    }
  }, [stopSpeaking, speechLang, isAisiaSelfEcho])

  // Bidirectional Voice Call Handlers
  const startVoiceCall = useCallback(async () => {
    setActiveModal('voice-call')
    setIsMuted(false)
    isMutedRef.current = false
    stopSpeaking()

    // 1. Initialize real microphone AudioContext and AnalyserNode for volume physics & VAD
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Real-time acoustic visualizer loop
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const monitorAudio = () => {
        if (analyserRef.current && activeModalRef.current === 'voice-call') {
          analyserRef.current.getByteFrequencyData(dataArray)
          requestAnimationFrame(monitorAudio)
        }
      }
      requestAnimationFrame(monitorAudio)
    } catch (e) {
      console.warn('Microphone access warning:', e)
    }

    // 2. Start continuous speech recognition
    try {
      if (recognitionRef.current) {
        recognitionRef.current.continuous = true
        recognitionRef.current.lang = speechLangRef.current || 'en-US'
        recognitionRef.current.start()
        setIsRecording(true)
      }
    } catch (_) {}
  }, [stopSpeaking])

  const endVoiceCall = useCallback(() => {
    stopSpeaking()
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (abortControllerRef.current) abortControllerRef.current.abort()

    // Stop mic stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch (_) {}
      audioContextRef.current = null
    }
    analyserRef.current = null

    // Stop recognition
    try {
      if (recognitionRef.current) {
        recognitionRef.current.continuous = false
        recognitionRef.current.stop()
      }
    } catch (_) {}

    setIsRecording(false)
    setIsMuted(false)
    isMutedRef.current = false
    setLiveTranscription('')
    setIsInCallChatOpen(false)
    setInCallInput('')
    setActiveModal('none')
  }, [stopSpeaking])

  const toggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    isMutedRef.current = nextMuted

    if (nextMuted) {
      try { recognitionRef.current?.stop() } catch (_) {}
      setIsRecording(false)
    } else {
      try {
        recognitionRef.current?.start()
        setIsRecording(true)
      } catch (_) {}
    }
  }

  // Standard mic toggle for chat input
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Chrome.')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
      setStatusMessage('')
    } else {
      stopSpeaking()
      try {
        recognitionRef.current.continuous = false
        recognitionRef.current.lang = speechLang || 'en-US'
        recognitionRef.current.start()
      } catch (err) {
        console.error('Start recognition error', err)
        setIsRecording(false)
      }
    }
  }

  // Handle Multimodal File Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments(prev => [
          ...prev,
          {
            name: file.name,
            mime: file.type || 'application/octet-stream',
            data: reader.result as string
          }
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // Core Send Message Logic with Streaming & Vision
  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText !== undefined ? queryText : inputText).trim()
    if (!textToSend && attachments.length === 0) return

    stopSpeaking()
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const currentThread = activeThreadId || 'default'
    const stagedAttachments = [...attachments]
    setInputText('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Add user message
    setMessages(prev => [
      ...prev,
      {
        id: String(Date.now()),
        sender: 'user',
        text: textToSend,
        timestamp: timeStr,
        attachments: stagedAttachments.map(a => ({ name: a.name, mime: a.mime, data: a.data }))
      }
    ])

    // Placeholder Aisia streaming message
    const aisiaMsgId = String(Date.now() + 1)
    setMessages(prev => [
      ...prev,
      {
        id: aisiaMsgId,
        sender: 'aisia',
        text: '',
        timestamp: timeStr,
        isStreaming: true
      }
    ])

    setIsProcessing(true)
    setStatusMessage('Thinking...')
    const startTime = performance.now()

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: textToSend,
          voice: selectedVoice,
          rate: voiceSpeed,
          username: currentUser,
          thread_id: currentThread,
          attachments: stagedAttachments,
          model: selectedModel,
          language: speechLang,
          agent_mode: agentMode,
          pitch: voicePitch,
          persona: voicePersona
        }),
        signal: abortController.signal
      })

      if (!response.ok || !response.body) throw new Error('Stream failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let accumulatedText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'status') {
              setStatusMessage(data.message)
            } else if (data.type === 'tool_step') {
              const newStep: ToolExecutionStep = data.step
              setMessages(prev => prev.map(m => {
                if (m.id !== aisiaMsgId) return m
                const currentSteps = m.toolSteps || []
                const existingIdx = currentSteps.findIndex(s => s.id === newStep.id)
                const updated = existingIdx >= 0
                  ? currentSteps.map(s => s.id === newStep.id ? newStep : s)
                  : [...currentSteps, newStep]
                return { ...m, toolSteps: updated }
              }))
            } else if (data.type === 'sources') {
              setMessages(prev => prev.map(m => 
                m.id === aisiaMsgId ? { ...m, sources: data.sources } : m
              ))
            } else if (data.type === 'follow_ups') {
              setMessages(prev => prev.map(m => 
                m.id === aisiaMsgId ? { ...m, followUps: data.follow_ups } : m
              ))
            } else if (data.type === 'token') {
              setStatusMessage('')
              accumulatedText += data.content
              setMessages(prev => prev.map(m => 
                m.id === aisiaMsgId ? { ...m, text: accumulatedText } : m
              ))
            } else if (data.type === 'audio') {
              if (voiceEnabled && data.audio) {
                enqueueAudioChunk(data.audio, data.sentence)
              }
            } else if (data.type === 'done') {
              const latency = Math.round(performance.now() - startTime)
              setLatencyHud(`~${latency}ms`)
              const finalContent = data.reply || accumulatedText
              const finalToolSteps = data.tool_steps
              setMessages(prev => prev.map(m => {
                if (m.id !== aisiaMsgId) return m
                const mergedSteps = finalToolSteps && finalToolSteps.length > 0
                  ? finalToolSteps
                  : m.toolSteps
                return {
                  ...m,
                  text: finalContent,
                  isStreaming: false,
                  toolSteps: mergedSteps,
                  sources: data.sources || m.sources,
                  followUps: data.follow_ups || m.followUps
                }
              }))
              setStatusMessage('')

              // Auto-detect artifacts in Coding Agent mode or when code is generated
              const detected = extractArtifactsFromText(finalContent)
              if (detected.length > 0) {
                const incomingArt = detected[0]
                setActiveArtifact(prev => {
                  if (prev && prev.files && prev.files.length > 0 && incomingArt.files && incomingArt.files.length > 0) {
                    // Smart merge files into current project
                    const mergedFiles = [...prev.files]
                    for (const inc of incomingArt.files) {
                      const idx = mergedFiles.findIndex(f => f.name.toLowerCase() === inc.name.toLowerCase())
                      if (idx >= 0) {
                        mergedFiles[idx] = inc
                      } else {
                        mergedFiles.push(inc)
                      }
                    }
                    const activeName = incomingArt.activeFileName || prev.activeFileName
                    const activeContent = (mergedFiles.find(f => f.name === activeName) || mergedFiles[0]).content
                    return {
                      ...prev,
                      title: incomingArt.title && incomingArt.title !== 'Multi-File Web Project' ? incomingArt.title : prev.title,
                      files: mergedFiles,
                      code: activeContent,
                      activeFileName: activeName
                    }
                  }
                  return incomingArt
                })
                if (agentMode === 'coding') {
                  setIsCanvasOpen(true)
                }
              }
            }
          } catch (_) {}
        }
      }

      // Refresh threads if this was first message
      loadThreads()
      fetchMemories()
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => 
          m.id === aisiaMsgId 
            ? { ...m, text: "I'm ready. Let me know how I can help.", isStreaming: false }
            : m
        ))
      }
    } finally {
      setIsProcessing(false)
      setStatusMessage('')
    }
  }

  // ChatGPT-style In-Call Message handler (when user is in quiet room or cannot speak)
  const handleSendInCallMessage = async (customText?: string) => {
    const query = (customText !== undefined ? customText : inCallInput).trim()
    if (!query) return
    setInCallInput('')

    // Acoustic barge-in / interrupt existing speech
    stopSpeaking()
    if (abortControllerRef.current) abortControllerRef.current.abort()

    setLiveTranscription(`"${query}"`)
    await handleSendMessage(query)
  }

  // Play single text TTS (replay button)
  const replayAudio = async (text: string) => {
    if (!text) return
    stopSpeaking()
    try {
      setIsSpeaking(true)
      const res = await fetch('http://localhost:8000/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voice: selectedVoice, 
          rate: voiceSpeed, 
          pitch: voicePitch,
          language: speechLang 
        })
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch (err) {
      console.warn('Replay failed', err)
      setIsSpeaking(false)
    }
  }

  // Live audio test preview for persona presets or custom pitch/speed sliders
  const playVoicePreview = async (presetId: string, testPitch?: string, testRate?: string, customText?: string) => {
    // If already playing this preset, stop it
    if (previewAudioPlaying === presetId) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
      setPreviewAudioPlaying(null)
      return
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }

    const preset = PERSONA_PRESETS.find(p => p.id === presetId)
    const text = customText || preset?.previewSample || "Hello! This is a live voice preview of my tone and emotion persona."
    const pitch = testPitch || preset?.defaultPitch || voicePitch
    const rate = testRate || preset?.defaultRate || voiceSpeed

    setPreviewAudioPlaying(presetId)

    try {
      const res = await fetch('http://localhost:8000/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          rate,
          pitch,
          language: speechLang
        })
      })

      if (!res.ok) throw new Error('Preview TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      previewAudioRef.current = audio

      audio.onended = () => {
        setPreviewAudioPlaying(null)
        previewAudioRef.current = null
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setPreviewAudioPlaying(null)
        previewAudioRef.current = null
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch (e) {
      console.warn('Audio preview error', e)
      setPreviewAudioPlaying(null)
      previewAudioRef.current = null
    }
  }

  const applyPersona = (preset: PersonaPreset) => {
    setVoicePersona(preset.id)
    setVoicePitch(preset.defaultPitch)
    setVoiceSpeed(preset.defaultRate)
    localStorage.setItem('aisia_persona', preset.id)
    localStorage.setItem('aisia_pitch', preset.defaultPitch)
    localStorage.setItem('aisia_speed', preset.defaultRate)
  }

  const getPitchLabel = (pitch: string) => {
    const num = parseInt(pitch) || 0
    if (num <= -5) return 'Deep & Authoritative'
    if (num < 0) return 'Grounded & Steady'
    if (num === 0) return 'Natural & Balanced'
    if (num <= 4) return 'Warm & Gentle'
    return 'Lively & Expressive'
  }

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Add Notion Todo
  const handleAddNotion = async () => {
    if (!notionTaskText.trim()) return
    setNotionStatus('Adding...')
    try {
      const res = await fetch('http://localhost:8000/notion/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: notionTaskText })
      })
      const data = await res.json()
      setNotionStatus(data.message || 'Added!')
      setNotionTaskText('')
      fetchNotion()
      setTimeout(() => setNotionStatus(''), 3000)
    } catch (_) {
      setNotionStatus('Failed to add.')
    }
  }

  // Add Memory Fact
  const handleAddMemory = async () => {
    if (!newMemoryKey.trim() || !newMemoryVal.trim()) return
    try {
      await fetch('http://localhost:8000/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, key: newMemoryKey.trim(), value: newMemoryVal.trim() })
      })
      setNewMemoryKey('')
      setNewMemoryVal('')
      fetchMemories()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteMemory = async (memoryId: number) => {
    try {
      await fetch(`http://localhost:8000/memory/${memoryId}`, { method: 'DELETE' })
      setSavedMemories(prev => prev.filter(m => m.id !== memoryId))
    } catch (e) {
      console.error(e)
    }
  }

  // Upload Doc, Audio, Video to Knowledge Base
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await fetch('http://localhost:8000/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      fetchDocuments()
    } catch (e) {
      console.error(e)
    } finally {
      setIsUploading(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  const handleViewTranscript = async (filename: string) => {
    setIsLoadingTranscript(true)
    try {
      const res = await fetch(`http://localhost:8000/documents/${encodeURIComponent(filename)}/transcript`)
      if (res.ok) {
        const data = await res.json()
        setSelectedDocTranscript({ name: filename, content: data.transcript })
      }
    } catch (err) {
      console.error('Error loading transcript:', err)
    } finally {
      setIsLoadingTranscript(false)
    }
  }

  const handleDeleteDoc = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return
    try {
      await fetch(`http://localhost:8000/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      fetchDocuments()
    } catch (err) {
      console.error('Error deleting document:', err)
    }
  }

  const currentOrbState = isSpeaking ? 'speaking' : isRecording ? 'listening' : isProcessing ? 'thinking' : 'idle'

  return (
    <div className="gpt-root">
      {/* LEFT SIDEBAR (Collapsible) */}
      <aside className={`gpt-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-dot"></span>
            <span className="brand-title">Aisia</span>
            <span className="brand-version">v2.5</span>
          </div>
          <button 
            className="sidebar-close-btn" 
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* New Chat Button */}
        <button className="new-chat-btn" onClick={handleNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          <span>New chat</span>
          <kbd className="kbd-shortcut">⌘K</kbd>
        </button>

        {/* Threads List */}
        <div className="sidebar-threads-scroll">
          <div className="threads-section-title">Recent Conversations</div>
          {threads.length === 0 ? (
            <div className="threads-empty">No conversations yet</div>
          ) : (
            threads.map(t => (
              <div 
                key={t.id} 
                className={`thread-item ${t.id === activeThreadId ? 'active' : ''}`}
                onClick={() => selectThread(t.id)}
              >
                <svg className="thread-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="thread-title">{t.title}</span>
                <button 
                  className="thread-del-btn" 
                  onClick={(e) => handleDeleteThread(e, t.id)}
                  title="Delete chat"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Footer Widgets */}
        <div className="sidebar-footer">
          <div 
            className="integrations-quick-pill"
            onClick={() => {
              setActiveModal('settings')
              setSettingsTab('integrations')
            }}
            style={{ cursor: 'pointer' }}
            title="Open Model Context Protocol (MCP) Hub"
          >
            <span className="status-live-dot"></span>
            <span>{mcpServers.length || 10} MCP Integrations</span>
          </div>

          <div className="sidebar-user-row">
            <div className="user-avatar">{currentUser.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <span className="user-name">{currentUser}</span>
              <span className="user-plan">Pro Autonomous Agent</span>
            </div>
            <button 
              className="user-settings-trigger" 
              onClick={() => setActiveModal('settings')}
              title="Settings (Voice, Orb, Memory)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="gpt-main">
        {/* TOP NAVBAR */}
        <header className="gpt-header">
          <div className="header-left">
            {!sidebarOpen && (
              <button 
                className="header-icon-btn sidebar-trigger" 
                onClick={() => setSidebarOpen(true)}
                title="Open sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
              </button>
            )}

            {/* Model Selector Dropdown */}
            <div className="model-selector-container">
              <button 
                className="model-selector-btn"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
              >
                <span className="model-indicator-dot" />
                <span className="model-name">
                  {MODEL_OPTIONS.find(m => m.id === selectedModel)?.name}
                </span>
                <span className="model-pill">
                  {MODEL_OPTIONS.find(m => m.id === selectedModel)?.badge}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
              </button>

              {showModelDropdown && (
                <div className="model-dropdown-menu">
                  {MODEL_OPTIONS.map(m => (
                    <div 
                      key={m.id} 
                      className={`model-option ${m.id === selectedModel ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedModel(m.id)
                        setShowModelDropdown(false)
                      }}
                    >
                      <div className="model-option-top">
                        <span className="model-opt-name">{m.name}</span>
                        <span className="model-opt-badge">{m.badge}</span>
                      </div>
                      <span className="model-opt-desc">{m.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Centered Segmented Control Mode Switcher */}
          <div className="header-center">
            <div className="agent-mode-switcher">
              <button 
                type="button"
                className={`agent-mode-tab ${agentMode === 'general' ? 'active' : ''}`}
                onClick={() => setAgentMode('general')}
                title="Quick Assistant with Notion, RAG, and Web access"
              >
                <span className="mode-icon">⚡</span>
                <span className="mode-label">Quick</span>
              </button>
              <button 
                type="button"
                className={`agent-mode-tab ${agentMode === 'deep_research' ? 'active' : ''}`}
                onClick={() => setAgentMode('deep_research')}
                title="Perplexity-style Deep Web Research with multi-source crawling and citations"
              >
                <span className="mode-icon">🔬</span>
                <span className="mode-label">Research</span>
                <span className="mode-badge pro-badge">Pro</span>
              </button>
              <button 
                type="button"
                className={`agent-mode-tab ${agentMode === 'coding' ? 'active' : ''}`}
                onClick={() => {
                  setAgentMode('coding')
                  if (!isCanvasOpen) {
                    if (!activeArtifact) setActiveArtifact(DEFAULT_STOPWATCH_ARTIFACT)
                    setIsCanvasOpen(true)
                  }
                }}
                title="Coding Agent with Live Artifacts Interactive Canvas"
              >
                <span className="mode-icon">💻</span>
                <span className="mode-label">Canvas</span>
                <span className="mode-badge">Code</span>
              </button>
            </div>
          </div>

          <div className="header-right">
            {/* Consolidated Tools & Integrations Popover */}
            <div className="tools-menu-wrapper" ref={toolsMenuRef}>
              <button 
                type="button"
                className={`header-pill-btn tools-trigger-btn ${showToolsMenu ? 'active' : ''}`}
                onClick={() => setShowToolsMenu(prev => !prev)}
                title="Tools, MCP Servers, Documents & Integrations"
              >
                <span className="tools-sparkle-icon">⚡</span>
                <span>Tools</span>
                <span className="header-count-bubble">{(mcpServers.length || 10) + documents.length}</span>
                <svg 
                  width="11" 
                  height="11" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  style={{ transform: showToolsMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {showToolsMenu && (
                <div className="tools-dropdown-menu">
                  <div className="tools-dropdown-header">EXTENSIONS & KNOWLEDGE</div>

                  <button 
                    type="button" 
                    className="tools-dropdown-item"
                    onClick={() => {
                      setShowToolsMenu(false)
                      setActiveModal('settings')
                      setSettingsTab('integrations')
                    }}
                  >
                    <div className="tools-item-left">
                      <span className="tools-item-icon">🔌</span>
                      <div className="tools-item-text">
                        <div className="tools-item-title">MCP Hub & Tools</div>
                        <div className="tools-item-sub">{mcpServers.length || 10} servers connected</div>
                      </div>
                    </div>
                    <span className="tools-item-badge live">Connected</span>
                  </button>

                  <button 
                    type="button" 
                    className="tools-dropdown-item"
                    onClick={() => {
                      setShowToolsMenu(false)
                      setActiveModal('files')
                    }}
                  >
                    <div className="tools-item-left">
                      <span className="tools-item-icon">📁</span>
                      <div className="tools-item-text">
                        <div className="tools-item-title">Knowledge Files</div>
                        <div className="tools-item-sub">{documents.length} docs & transcripts</div>
                      </div>
                    </div>
                    <span className="tools-item-badge count">{documents.length}</span>
                  </button>

                  <button 
                    type="button" 
                    className="tools-dropdown-item"
                    onClick={() => {
                      setShowToolsMenu(false)
                      setActiveModal('notion')
                    }}
                  >
                    <div className="tools-item-left">
                      <span className="tools-item-icon">📝</span>
                      <div className="tools-item-text">
                        <div className="tools-item-title">Notion Workspace</div>
                        <div className="tools-item-sub">Sprint board & notes</div>
                      </div>
                    </div>
                    <span className="tools-item-badge sync">Sync</span>
                  </button>
                </div>
              )}
            </div>

            {/* LIVE VOICE MODE BUTTON */}
            <button 
              className="voice-call-trigger-btn"
              onClick={startVoiceCall}
              title="Open Gemini Live Voice Mode (Orb Visualizer)"
            >
              <span className="voice-pulse-ring" />
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
              </svg>
              <span>Live Voice</span>
            </button>

            {/* Settings Trigger */}
            <button 
              className="header-icon-btn" 
              onClick={() => setActiveModal('settings')}
              title="Settings (Voice, Persona, Memory, MCP, System)"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </header>

        {/* WORKSPACE SPLIT-SCREEN LAYOUT */}
        <div className="gpt-workspace-layout">
          <div className={`gpt-chat-column ${isCanvasOpen ? 'with-canvas' : ''}`}>
            {/* CHAT MESSAGES CONTAINER */}
            <div className="gpt-messages-container">
              {messages.length === 0 ? (
                /* EMPTY STATE (ChatGPT / Claude style) */
                <div className="gpt-empty-state">
                  <div className="empty-brand-icon">
                    <div className="empty-sparkle-dot"></div>
                  </div>
                  {agentMode === 'deep_research' ? (
                    <>
                      <h2 className="empty-greeting">Deep Research & Multi-Source Synthesis</h2>
                      <p className="empty-sub">
                        Crawl live web publications, verify facts across sources, cite inline references, and autonomously chain tasks.
                      </p>
                      <div className="starter-prompts-grid">
                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Compare viscous dampers vs tuned mass dampers in structural engineering")}
                        >
                          <span className="starter-title">🔬 Structural Damping Comparison</span>
                          <span className="starter-desc">In-depth seismic & wind vibration control analysis with academic citations</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Conduct an in-depth market and technology analysis of solid-state EV batteries in 2026")}
                        >
                          <span className="starter-title">🔋 Solid-State Battery Analysis</span>
                          <span className="starter-desc">Energy density metrics, commercialization timelines, and top manufacturers</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Deep research autonomous AI agent frameworks in 2026 and save a summary brief to my Notion workspace")}
                        >
                          <span className="starter-title">⚡ Multi-Action: Research & Sync to Notion</span>
                          <span className="starter-desc">Autonomous web crawl + structured brief automatically created in your workspace</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Investigate the latest architectural strategies for base isolation in earthquake zones")}
                        >
                          <span className="starter-title">🏛️ Seismic Base Isolation Review</span>
                          <span className="starter-desc">Lead rubber bearings, friction pendulums, and global building codes</span>
                        </button>
                      </div>
                    </>
                  ) : agentMode === 'coding' ? (
                    <>
                      <h2 className="empty-greeting">Coding Agent & Canvas</h2>
                      <p className="empty-sub">
                        Generate interactive single-file web apps, SVGs, and Mermaid diagrams with side-by-side live execution.
                      </p>
                      <div className="starter-prompts-grid">
                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Create a modern interactive Stopwatch web app with millisecond timer, lap records, and neon glassmorphism UI")}
                        >
                          <span className="starter-title">⏱️ Stopwatch Web App</span>
                          <span className="starter-desc">Live interactive timer with start/pause/reset and lap recording</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Build an interactive 3D Glassmorphic Pricing Card in HTML/CSS with monthly/annual billing switch and hover glow")}
                        >
                          <span className="starter-title">💎 Glassmorphic Pricing UI</span>
                          <span className="starter-desc">Clean modern component with animated toggle and gradient borders</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Generate a complete Mermaid architecture diagram for a Distributed Real-time AI Agent system")}
                        >
                          <span className="starter-title">📐 Architecture Diagram</span>
                          <span className="starter-desc">Mermaid flowchart showing Frontend, FastAPI, Redis, and LLM nodes</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Create an interactive Pomodoro Focus Timer web app with 25-minute countdown, audio alerts, and task progress bar")}
                        >
                          <span className="starter-title">🍅 Pomodoro Productivity App</span>
                          <span className="starter-desc">Interactive circular progress bar, sound synthesis, and state machine</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="empty-greeting">What can I help with today?</h2>
                      <p className="empty-sub">
                        Aisia is connected to your Notion workspace, Chroma vector database, Edge Neural TTS, and Gemini Multimodal vision.
                      </p>
                      <div className="starter-prompts-grid">
                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Analyze my codebase architecture and suggest optimizations")}
                        >
                          <span className="starter-title">Analyze Architecture</span>
                          <span className="starter-desc">Review modular design, speed, and backend endpoints</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Add task to Notion: Complete multimodal AI agent refactoring")}
                        >
                          <span className="starter-title">Update Notion Workspace</span>
                          <span className="starter-desc">Create or update tasks and read workspace pages</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={() => handleSendMessage("Check the weather in Tokyo and tell me if it will rain today")}
                        >
                          <span className="starter-title">Live Weather & Services</span>
                          <span className="starter-desc">Real-time weather forecasts, calendars, and emails</span>
                        </button>

                        <button 
                          className="starter-prompt-card"
                          onClick={startVoiceCall}
                        >
                          <span className="starter-title">Gemini Live Voice Mode</span>
                          <span className="starter-desc">Talk hands-free with real-time neural speech and visualizer</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* MESSAGES LIST */
                <div className="messages-scroll-area">
                  {messages.map(msg => (
                    <div key={msg.id} className={`message-row ${msg.sender}`}>
                      <div className="message-wrapper">
                        {msg.sender === 'aisia' && (
                          <div className="message-avatar aisia-avatar">
                            <span className="avatar-letter">A</span>
                          </div>
                        )}

                        <div className="message-bubble-content">
                          {/* Attachments if any */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="message-attachments-grid">
                              {msg.attachments.map((att, i) => (
                                <div key={i} className="attachment-card">
                                  {att.mime.startsWith('image/') ? (
                                    <img src={att.data} alt={att.name} className="attachment-thumb-img" />
                                  ) : (
                                    <div className="attachment-file-icon">
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                                      <span>{att.name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Text content with Artifact extraction and Open Canvas action */}
                          <div className="message-text">
                            {msg.sender === 'aisia' ? (
                              <ChatMessageContent 
                                text={msg.text || (msg.isStreaming ? 'Thinking...' : '')}
                                isStreaming={msg.isStreaming}
                                toolSteps={msg.toolSteps}
                                sources={msg.sources}
                                followUps={msg.followUps}
                                onSelectFollowUp={(q: string) => handleSendMessage(q)}
                                onOpenArtifact={(art: Artifact) => {
                                  setActiveArtifact(art)
                                  setIsCanvasOpen(true)
                                }}
                              />
                            ) : (
                              msg.text
                            )}
                          </div>

                      {/* Footer Actions */}
                      {msg.sender === 'aisia' && !msg.isStreaming && msg.text && (
                        <div className="message-actions">
                          <button 
                            className="msg-action-btn"
                            onClick={() => navigator.clipboard.writeText(msg.text)}
                            title="Copy response"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>Copy</span>
                          </button>
                          <button 
                            className="msg-action-btn"
                            onClick={() => replayAudio(msg.text)}
                            title="Play neural voice audio"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                            <span>Listen</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {msg.sender === 'user' && (
                      <div className="message-avatar user-avatar-msg">
                        <span>{currentUser.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Status Indicator */}
              {statusMessage && (
                <div className="status-pill-banner">
                  <div className="status-spinner"></div>
                  <span>{statusMessage}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* FLOATING BOTTOM INPUT AREA (ChatGPT style) */}
        <div className="gpt-input-container">
          <div className="gpt-input-box">
            {/* Staged Attachments Preview */}
            {attachments.length > 0 && (
              <div className="staged-attachments-row">
                {attachments.map((att, idx) => (
                  <div key={idx} className="staged-item">
                    {att.mime.startsWith('image/') ? (
                      <img src={att.data} alt={att.name} className="staged-thumb" />
                    ) : (
                      <div className="staged-file-badge">📄 {att.name}</div>
                    )}
                    <button className="staged-remove-btn" onClick={() => removeAttachment(idx)}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Expanding Textarea Top Row */}
            <div className="chat-textarea-container">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                rows={1}
                placeholder={
                  agentMode === 'deep_research'
                    ? "Deep Research: Ask any complex question to crawl web, cross-cite sources, or sync to Notion..."
                    : agentMode === 'coding'
                    ? "Coding Agent: Ask to build web apps, components, diagrams, or edit code in Canvas..."
                    : "Message Aisia or ask to run tools (Notion, Vector DB, Web, Weather)..."
                }
                value={inputText}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Bottom Actions Bar (ChatGPT 4o / Claude style) */}
            <div className="input-bottom-actions">
              <div className="input-actions-left">
                {/* Multimodal Attachment Button */}
                <button 
                  type="button"
                  className="input-tool-pill-btn" 
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach images, PDFs, or code files"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
                  <span>Attach</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  multiple 
                  accept="image/*,.pdf,.txt,.md,.json" 
                  style={{ display: 'none' }} 
                />

                {/* Multilingual Language Pill */}
                <div className="input-lang-wrapper">
                  <button 
                    type="button"
                    className="input-lang-pill-btn"
                    onClick={() => setShowLangMenu(!showLangMenu)}
                    title={`Active Language: ${LANGUAGES.find(l => l.code === speechLang)?.name}`}
                  >
                    <span className="lang-flag">{LANGUAGES.find(l => l.code === speechLang)?.flag}</span>
                    <span className="lang-code">{LANGUAGES.find(l => l.code === speechLang)?.label}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                  {showLangMenu && (
                    <div className="lang-dropdown-menu">
                      <div className="lang-dropdown-header">Spoken & Synthesis Language</div>
                      <div className="lang-options-scroll">
                        {LANGUAGES.map(l => (
                          <div 
                            key={l.code}
                            className={`lang-option ${l.code === speechLang ? 'selected' : ''}`}
                            onClick={() => {
                              setSpeechLang(l.code)
                              localStorage.setItem('aisia_speech_lang', l.code)
                              setShowLangMenu(false)
                              if (recognitionRef.current) {
                                recognitionRef.current.lang = l.code
                              }
                            }}
                          >
                            <span className="opt-flag">{l.flag}</span>
                            <span className="opt-name">{l.name}</span>
                            {l.code === speechLang && <span className="opt-check">✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="input-actions-right">
                {/* Audio-reactive Mic Speech-to-Text Button */}
                <button 
                  type="button"
                  className={`input-tool-pill-btn mic-btn ${isRecording ? 'recording' : ''}`}
                  onClick={toggleRecording}
                  title={isRecording ? "Stop voice input" : `Speak in ${LANGUAGES.find(l => l.code === speechLang)?.name}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  {isRecording && <span className="mic-live-dot"></span>}
                </button>

                {/* Circular Send Arrow Button */}
                <button 
                  type="button"
                  className={`send-arrow-btn ${inputText.trim() || attachments.length > 0 ? 'active' : ''}`}
                  onClick={() => handleSendMessage()}
                  disabled={(!inputText.trim() && attachments.length === 0) || isProcessing}
                  title="Send message"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div className="input-disclaimer">
            Aisia can make mistakes. Verify important workspace tasks and decisions.
          </div>
        </div>
      </div>

      {/* SPLIT-SCREEN / SLIDE-OUT CODING ARTIFACTS CANVAS */}
      {isCanvasOpen && (
        <CodingCanvas
          artifact={activeArtifact}
          isOpen={isCanvasOpen}
          onClose={() => setIsCanvasOpen(false)}
          speechLang={speechLang}
          onUpdateCode={(newCode: string) => {
            if (activeArtifact) {
              setActiveArtifact({ ...activeArtifact, code: newCode })
            }
          }}
          onUpdateArtifact={(updated) => {
            setActiveArtifact(updated)
          }}
          onPromptAgent={(prompt: string) => {
            handleSendMessage(prompt)
          }}
        />
      )}
    </div>
  </main>

      {/* --- MODAL 1: IMMERSIVE GEMINI LIVE VOICE CALL OVERLAY --- */}
      {activeModal === 'voice-call' && (
        <div className={`voice-call-overlay ${isInCallChatOpen ? 'chat-open' : ''}`}>
          <div className="voice-call-topbar">
            <div className="voice-call-pill">
              <span className="live-pulse-dot"></span>
              <span>Gemini Live Neural Voice</span>
            </div>

            {/* In-Call Quiet Mode Status Pill */}
            {isInCallChatOpen && (
              <div className="voice-call-mode-pill">
                <span className="mode-quiet-dot"></span>
                <span>Quiet Messaging Active</span>
              </div>
            )}

            {/* In-Call Language Selector */}
            <div className="voice-call-lang-select-box">
              <select 
                className="voice-call-lang-dropdown"
                value={speechLang}
                onChange={(e) => {
                  setSpeechLang(e.target.value)
                  localStorage.setItem('aisia_speech_lang', e.target.value)
                  if (recognitionRef.current) {
                    recognitionRef.current.lang = e.target.value
                  }
                }}
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                ))}
              </select>
            </div>

            <button 
              className="voice-call-close-btn"
              onClick={endVoiceCall}
              title="End Voice Call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Centered Voice Stage: Visualizer Orb & In-Call Chat Drawer */}
          <div className={`voice-call-stage ${isInCallChatOpen ? 'split-layout' : ''}`}>
            {/* Visualizer Area */}
            <div className="voice-call-center">
              <div className="orb-call-wrapper">
                <VoiceOrb 
                  state={currentOrbState}
                  size={isInCallChatOpen ? 200 : 340}
                  theme={orbTheme}
                  analyserRef={analyserRef}
                  isMuted={isMuted}
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeaking()
                    } else {
                      toggleMute()
                    }
                  }}
                />
              </div>

              <div className="voice-state-title">
                {isSpeaking 
                  ? 'Aisia is speaking • Speak or type to interrupt' 
                  : isProcessing 
                  ? 'Aisia is thinking...' 
                  : isMuted 
                  ? (isInCallChatOpen ? 'Microphone muted • Type freely below' : 'Microphone muted (tap mic to speak)') 
                  : isRecording 
                  ? 'Connected • Listening to you...' 
                  : 'Connecting...'}
              </div>

              {liveTranscription && !isInCallChatOpen && (
                <div className="voice-subtitle-box">
                  "{liveTranscription}"
                </div>
              )}
            </div>

            {/* In-Call Text Chat Panel (ChatGPT style) */}
            {isInCallChatOpen && (
              <div className="voice-call-chat-drawer">
                <div className="in-call-drawer-header">
                  <div className="drawer-header-left">
                    <span className="drawer-icon">💬</span>
                    <div>
                      <div className="drawer-title">Quiet Messaging Mode</div>
                      <div className="drawer-sub">Type your request if you can't talk aloud</div>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="drawer-close-btn" 
                    onClick={() => setIsInCallChatOpen(false)}
                    title="Minimize chat drawer"
                  >
                    ×
                  </button>
                </div>

                {/* In-Call Live Chat Bubbles */}
                <div className="in-call-drawer-history">
                  {messages.length === 0 ? (
                    <div className="drawer-empty-state">
                      <div className="drawer-empty-icon">🤫</div>
                      <div className="drawer-empty-bold">In a quiet room or meeting?</div>
                      <div className="drawer-empty-text">
                        Type your message below. Aisia will process and reply instantly in real-time without leaving your call.
                      </div>
                    </div>
                  ) : (
                    messages.slice(-8).map(msg => (
                      <div key={msg.id} className={`in-call-bubble ${msg.sender}`}>
                        <div className="bubble-meta">
                          <span className="bubble-author">{msg.sender === 'user' ? 'You' : 'Aisia'}</span>
                          <span className="bubble-time">{msg.timestamp || ''}</span>
                        </div>
                        <div className="bubble-body">
                          {msg.text ? (
                            <>
                              <span>{msg.text}</span>
                              {msg.isStreaming && <span className="typing-cursor" style={{ display: 'inline-block', marginLeft: '4px' }} />}
                            </>
                          ) : msg.isStreaming ? (
                            <span className="bubble-streaming-indicator">
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                            </span>
                          ) : ''}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={inCallChatEndRef} />
                </div>

                {/* Quick Suggestion Chips */}
                <div className="in-call-quick-chips">
                  {[
                    "Summarize what we discussed",
                    "Explain this simply",
                    "What are our action items?"
                  ].map(prompt => (
                    <button 
                      key={prompt}
                      type="button" 
                      className="in-call-chip"
                      onClick={() => handleSendInCallMessage(prompt)}
                      disabled={isProcessing}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Floating Typing Form */}
                <form 
                  className="in-call-input-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendInCallMessage()
                  }}
                >
                  <input 
                    type="text"
                    className="in-call-text-input"
                    placeholder="Type a message to Aisia (can't talk right now)..."
                    value={inCallInput}
                    onChange={(e) => setInCallInput(e.target.value)}
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    className="in-call-send-btn"
                    disabled={!inCallInput.trim() || isProcessing}
                    title="Send message (Enter)"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Voice Call Action Controls */}
          <div className="voice-call-controls">
            {/* Keyboard / Text Chat Button (ChatGPT-style in-call messaging) */}
            <button 
              type="button"
              className={`call-ctrl-btn chat-toggle-btn ${isInCallChatOpen ? 'active-chat' : ''}`}
              onClick={() => setIsInCallChatOpen(prev => !prev)}
              title={isInCallChatOpen ? "Hide chat drawer" : "Message Aisia (if you can't speak out loud)"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>

            {/* Mute / Unmute Button */}
            <button 
              className={`call-ctrl-btn ${isMuted ? 'muted' : 'active-mic'}`}
              onClick={toggleMute}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>

            {/* Instant Interrupt Button */}
            {isSpeaking && (
              <button 
                className="call-ctrl-btn interrupt-btn"
                onClick={stopSpeaking}
                title="Interrupt / Barge-in"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12"/></svg>
              </button>
            )}

            {/* End Call Button */}
            <button 
              className="call-ctrl-btn end-call-btn"
              onClick={endVoiceCall}
              title="Hang up call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 2: BESPOKE STUDIO SETTINGS --- */}
      {activeModal === 'settings' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog settings-studio-dialog" onClick={e => e.stopPropagation()}>
            {/* Left Studio Sidebar Navigation */}
            <aside className="settings-studio-sidebar">
              <div className="settings-sidebar-header">
                <div className="settings-sidebar-logo-row">
                  <span className="settings-logo-dot"></span>
                  <span className="settings-sidebar-title">Preferences</span>
                </div>
                <span className="settings-studio-pill">Studio v2.5</span>
              </div>

              <nav className="settings-sidebar-nav">
                <button 
                  type="button"
                  className={`settings-nav-item ${settingsTab === 'voice' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('voice')}
                >
                  <span className="nav-item-icon">🎙️</span>
                  <div className="nav-item-text">
                    <span className="nav-item-title">Voice & Visualizer</span>
                    <span className="nav-item-sub">Neural voice & orb theme</span>
                  </div>
                </button>

                <button 
                  type="button"
                  className={`settings-nav-item ${settingsTab === 'persona' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('persona')}
                >
                  <span className="nav-item-icon">🎭</span>
                  <div className="nav-item-text">
                    <span className="nav-item-title">Persona & Emotion</span>
                    <span className="nav-item-sub">Cadence, tone & pitch</span>
                  </div>
                </button>

                <button 
                  type="button"
                  className={`settings-nav-item ${settingsTab === 'memory' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('memory')}
                >
                  <span className="nav-item-icon">🧠</span>
                  <div className="nav-item-text">
                    <span className="nav-item-title">Autonomous Memory</span>
                    <span className="nav-item-sub">{savedMemories.length} facts remembered</span>
                  </div>
                </button>

                <button 
                  type="button"
                  className={`settings-nav-item ${settingsTab === 'integrations' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('integrations')}
                >
                  <span className="nav-item-icon">🔌</span>
                  <div className="nav-item-text">
                    <span className="nav-item-title">MCP Hub & Tools</span>
                    <span className="nav-item-sub">{mcpServers.length || 10} servers active</span>
                  </div>
                </button>

                <button 
                  type="button"
                  className={`settings-nav-item ${settingsTab === 'system' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('system')}
                >
                  <span className="nav-item-icon">⚡</span>
                  <div className="nav-item-text">
                    <span className="nav-item-title">Engine & System</span>
                    <span className="nav-item-sub">Latency & diagnostics</span>
                  </div>
                </button>
              </nav>

              <div className="settings-sidebar-footer">
                <div className="sidebar-agent-card">
                  <div className="agent-status-indicator">
                    <span className="status-live-dot"></span>
                    <span>Aisia Engine Online</span>
                  </div>
                  <div className="agent-footer-sub">Edge Neural TTS + Gemini 3.5</div>
                </div>
              </div>
            </aside>

            {/* Right Main Studio Content Area */}
            <main className="settings-studio-main">
              <header className="settings-main-header">
                <div>
                  <h2 className="settings-pane-title">
                    {settingsTab === 'voice' && 'Voice & Audio Visualizer'}
                    {settingsTab === 'persona' && 'Speaking Style & Emotion Persona'}
                    {settingsTab === 'memory' && 'Autonomous Long-Term Memory'}
                    {settingsTab === 'integrations' && 'Model Context Protocol (MCP) Hub'}
                    {settingsTab === 'system' && 'Engine Telemetry & Diagnostics'}
                  </h2>
                  <p className="settings-pane-desc">
                    {settingsTab === 'voice' && 'Configure natural speaking voices, multilingual speech input, and reactive orb visualizer themes.'}
                    {settingsTab === 'persona' && 'Fine-tune emotional demeanor, pitch frequency, and delivery pacing with live audio test previews.'}
                    {settingsTab === 'memory' && 'Manage persistent knowledge, user identity facts, and preferences remembered across sessions in SQLite.'}
                    {settingsTab === 'integrations' && 'Inspect connected MCP servers, explore tool schemas, and execute live integration tests.'}
                    {settingsTab === 'system' && 'Review neural TTS stream latency benchmarks, database health, and active AI model capabilities.'}
                  </p>
                </div>
                <button 
                  type="button"
                  className="settings-studio-close" 
                  onClick={() => setActiveModal('none')}
                  title="Close preferences (Esc)"
                >
                  ×
                </button>
              </header>

              <div className="settings-studio-body">
                {/* TAB 1: Voice & Orb Visualizer */}
                {settingsTab === 'voice' && (
                  <div className="settings-section">
                    <div className="setting-group">
                      <label className="setting-label">Voice Model Persona</label>
                      <p className="setting-desc">Ultra-natural human neural voice via Microsoft Edge Cognitive Services.</p>
                      <select 
                        className="setting-select"
                        value={selectedVoice}
                        onChange={(e) => {
                          setSelectedVoice(e.target.value)
                          localStorage.setItem('aisia_voice', e.target.value)
                        }}
                      >
                        {VOICE_OPTIONS.map(v => (
                          <option key={v.id} value={v.id}>{v.name} — {v.desc}</option>
                        ))}
                      </select>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">Primary Speech & Conversation Language</label>
                      <p className="setting-desc">Language used by your microphone for real-time speech recognition. Aisia will reply natively in this language.</p>
                      <select 
                        className="setting-select"
                        value={speechLang}
                        onChange={(e) => {
                          setSpeechLang(e.target.value)
                          localStorage.setItem('aisia_speech_lang', e.target.value)
                          if (recognitionRef.current) {
                            recognitionRef.current.lang = e.target.value
                          }
                        }}
                      >
                        {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">Orb Visualizer Theme (Gemini Live)</label>
                      <p className="setting-desc">The official iridescent orb visualizer style used during Live Voice conversations.</p>
                      <div className="orb-theme-selector-grid">
                        {ORB_THEMES.map(theme => (
                          <div 
                            key={theme.id}
                            className={`theme-card ${orbTheme === theme.id ? 'active' : ''}`}
                            onClick={() => {
                              setOrbTheme(theme.id)
                              localStorage.setItem('aisia_orb_theme', theme.id)
                            }}
                          >
                            <div className="theme-card-title">{theme.name}</div>
                            <div className="theme-card-desc">{theme.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="setting-group">
                      <label className="setting-checkbox-row">
                        <input 
                          type="checkbox" 
                          checked={handsFreeMode}
                          onChange={(e) => setHandsFreeMode(e.target.checked)} 
                        />
                        <span>Hands-free conversational mode (automatically re-arm microphone after Aisia finishes speaking)</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* TAB 2: Persona & Emotion Controls */}
                {settingsTab === 'persona' && (
                  <div className="settings-section">
                    <div className="setting-group">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="setting-label">Speaking Style & Emotion Persona</label>
                        <span className="persona-badge">Edge Neural + Gemini 3.5</span>
                      </div>
                      <p className="setting-desc">
                        Select a curated persona preset. Click <strong>Test Audio</strong> to preview how each preset speaks aloud.
                      </p>

                      <div className="persona-presets-grid">
                        {PERSONA_PRESETS.map(preset => {
                          const isSelected = voicePersona === preset.id
                          const isAudioPlaying = previewAudioPlaying === preset.id

                          return (
                            <div 
                              key={preset.id}
                              className={`persona-card ${isSelected ? 'active' : ''}`}
                              onClick={() => applyPersona(preset)}
                            >
                              <div className="persona-card-header">
                                <div className="persona-card-identity">
                                  <span className="persona-icon">{preset.icon}</span>
                                  <span className="persona-name">{preset.name}</span>
                                </div>
                                <span className="persona-badge">{preset.badge}</span>
                              </div>

                              <div className="persona-sub">{preset.subtitle}</div>
                              <div className="persona-desc">{preset.desc}</div>

                              <div className="persona-tags-row">
                                {preset.toneTags.map(tag => (
                                  <span key={tag} className="persona-tag">#{tag}</span>
                                ))}
                              </div>

                              <div className="persona-metrics-row">
                                <span>Pitch: {preset.defaultPitch}</span>
                                <span>•</span>
                                <span>Pacing: {preset.defaultRate}</span>
                              </div>

                              <div className="persona-actions-row" onClick={e => e.stopPropagation()}>
                                <button 
                                  type="button"
                                  className="persona-select-btn"
                                  onClick={() => applyPersona(preset)}
                                >
                                  {isSelected ? '✓ Active Persona' : 'Apply Persona'}
                                </button>

                                <button 
                                  type="button"
                                  className={`persona-preview-audio-btn ${isAudioPlaying ? 'playing' : ''}`}
                                  onClick={() => playVoicePreview(preset.id)}
                                  title={`Preview audio for ${preset.name} preset`}
                                >
                                  {isAudioPlaying ? (
                                    <>
                                      <div className="sound-wave-bars">
                                        <span className="wave-bar"></span>
                                        <span className="wave-bar"></span>
                                        <span className="wave-bar"></span>
                                        <span className="wave-bar"></span>
                                      </div>
                                      <span>Playing</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                      <span>Test Audio</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Fine Tuning Panel */}
                    <div className="setting-group">
                      <label className="setting-label">Fine-Grained Pitch & Pacing Tuning</label>
                      <p className="setting-desc">
                        Fine-tune exact vocal frequency and speech rate for your custom speaking persona.
                      </p>

                      <div className="fine-tuning-panel">
                        <div className="fine-slider-group">
                          <div className="fine-slider-top">
                            <span className="fine-slider-label">Vocal Pitch (Tone Frequency)</span>
                            <span className="fine-slider-value">
                              {voicePitch} — {getPitchLabel(voicePitch)}
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="-10"
                            max="10"
                            step="1"
                            className="pitch-range-slider"
                            value={parseInt(voicePitch) || 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value)
                              const formatted = val >= 0 ? `+${val}Hz` : `${val}Hz`
                              setVoicePitch(formatted)
                              localStorage.setItem('aisia_pitch', formatted)
                            }}
                          />
                          <div className="quick-pitch-row">
                            {[
                              { val: '-6Hz', label: 'Deep (-6Hz)' },
                              { val: '-2Hz', label: 'Grounded (-2Hz)' },
                              { val: '+0Hz', label: 'Natural (+0Hz)' },
                              { val: '+2Hz', label: 'Warm (+2Hz)' },
                              { val: '+6Hz', label: 'Lively (+6Hz)' }
                            ].map(opt => (
                              <button 
                                key={opt.val}
                                type="button"
                                className={`quick-pitch-btn ${voicePitch === opt.val ? 'active' : ''}`}
                                onClick={() => {
                                  setVoicePitch(opt.val)
                                  localStorage.setItem('aisia_pitch', opt.val)
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="fine-slider-group">
                          <div className="fine-slider-top">
                            <span className="fine-slider-label">Speaking Pacing (Rate)</span>
                            <span className="fine-slider-value">{voiceSpeed}</span>
                          </div>
                          <div className="speed-buttons-row">
                            {['-15%', '-5%', '+0%', '+10%', '+20%'].map(speed => (
                              <button 
                                key={speed}
                                type="button"
                                className={`speed-pill ${voiceSpeed === speed ? 'active' : ''}`}
                                onClick={() => {
                                  setVoiceSpeed(speed)
                                  localStorage.setItem('aisia_speed', speed)
                                }}
                              >
                                {speed}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                          type="button"
                          className={`test-settings-audio-btn ${previewAudioPlaying === 'custom' ? 'playing' : ''}`}
                          onClick={() => playVoicePreview('custom', voicePitch, voiceSpeed, "Hello! This is a live preview test of your current custom pitch and pacing settings.")}
                        >
                          {previewAudioPlaying === 'custom' ? (
                            <>
                              <div className="sound-wave-bars">
                                <span className="wave-bar"></span>
                                <span className="wave-bar"></span>
                                <span className="wave-bar"></span>
                                <span className="wave-bar"></span>
                              </div>
                              <span>Playing Custom Voice Test...</span>
                            </>
                          ) : (
                            <>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                              <span>Test Current Voice Settings (Pitch: {voicePitch}, Rate: {voiceSpeed})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Persistent Memory */}
                {settingsTab === 'memory' && (
                  <div className="settings-section">
                    <div className="setting-group">
                      <label className="setting-label">Stored Facts & Autonomous Memory</label>
                      <p className="setting-desc">Aisia autonomously remembers key facts about you across all sessions via local SQLite database.</p>
                      
                      <div className="memories-list">
                        {savedMemories.length === 0 ? (
                          <div className="empty-sub">No memories saved yet. Talk to Aisia to populate automatically.</div>
                        ) : (
                          savedMemories.map(m => (
                            <div key={m.id} className="memory-card">
                              <div className="memory-left">
                                <span className="memory-key">{m.key}</span>
                                <span className="memory-divider">:</span>
                                <span className="memory-val">{m.value}</span>
                              </div>
                              <button 
                                type="button" 
                                className="memory-delete-btn" 
                                onClick={() => handleDeleteMemory(m.id)}
                                title="Delete fact"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">Add Fact Manually</label>
                      <div className="add-memory-row">
                        <input 
                          type="text" 
                          placeholder="Key (e.g. role or preferred_framework)" 
                          className="setting-input" 
                          value={newMemoryKey}
                          onChange={e => setNewMemoryKey(e.target.value)}
                        />
                        <input 
                          type="text" 
                          placeholder="Value (e.g. Principal Architect or React 19)" 
                          className="setting-input" 
                          value={newMemoryVal}
                          onChange={e => setNewMemoryVal(e.target.value)}
                        />
                        <button className="setting-add-btn" onClick={handleAddMemory}>Save Fact</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: Model Context Protocol (MCP) Hub */}
                {settingsTab === 'integrations' && (
                  <div className="settings-section mcp-hub-section">
                    <div className="mcp-hub-banner">
                      <div className="mcp-banner-left">
                        <div className="mcp-banner-title-row">
                          <span className="mcp-badge-proto">MCP v1.0 Standard</span>
                          <span className="mcp-live-indicator">
                            <span className="mcp-live-dot"></span>
                            <span>Active Protocol</span>
                          </span>
                        </div>
                        <div className="mcp-banner-title">Model Context Protocol Hub</div>
                        <div className="mcp-banner-desc">
                          Aisia connects securely to external developer tools, persistent databases, and system resources using open MCP standards.
                        </div>
                      </div>

                      <div className="mcp-banner-actions">
                        <button 
                          type="button"
                          className="mcp-add-server-btn"
                          onClick={() => setShowAddMcpModal(true)}
                          title="Register an external stdio or SSE MCP server"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                          <span>Add MCP Server</span>
                        </button>
                      </div>
                    </div>

                    <div className="mcp-stats-grid">
                      <div className="mcp-stat-card">
                        <div className="mcp-stat-num">{mcpServers.length || 10}</div>
                        <div className="mcp-stat-label">Active Servers</div>
                      </div>
                      <div className="mcp-stat-card">
                        <div className="mcp-stat-num">
                          {mcpServers.reduce((acc, s) => acc + (s.tools?.length || 0), 0) || 16}
                        </div>
                        <div className="mcp-stat-label">Callable Tools</div>
                      </div>
                      <div className="mcp-stat-card">
                        <div className="mcp-stat-num">JSON-RPC</div>
                        <div className="mcp-stat-label">Transport Protocol</div>
                      </div>
                      <div className="mcp-stat-card">
                        <div className="mcp-stat-num">100% Local</div>
                        <div className="mcp-stat-label">Execution Security</div>
                      </div>
                    </div>

                    <div className="mcp-controls-bar">
                      <div className="mcp-category-filters">
                        {['All', 'Developer Tools', 'Data & Databases', 'Web & Network', 'DevOps & System', 'Productivity'].map(cat => (
                          <button
                            key={cat}
                            type="button"
                            className={`mcp-cat-btn ${mcpFilter === cat ? 'active' : ''}`}
                            onClick={() => setMcpFilter(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      <div className="mcp-search-wrap">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input 
                          type="text" 
                          placeholder="Search MCP servers or tools..." 
                          className="mcp-search-input"
                          value={mcpSearch}
                          onChange={e => setMcpSearch(e.target.value)}
                        />
                        {mcpSearch && (
                          <button type="button" className="mcp-search-clear" onClick={() => setMcpSearch('')}>×</button>
                        )}
                      </div>
                    </div>

                    {showAddMcpModal && (
                      <div className="mcp-custom-form-card">
                        <div className="mcp-form-header">
                          <div className="mcp-form-title">Register External MCP Server</div>
                          <button type="button" className="mcp-form-close" onClick={() => setShowAddMcpModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleAddCustomMcp} className="mcp-form-body">
                          <div className="mcp-form-row">
                            <label>Server Name</label>
                            <input 
                              type="text" 
                              className="setting-input" 
                              placeholder="e.g. Postgres Staging MCP or Kubernetes Tool" 
                              value={newMcpName}
                              onChange={e => setNewMcpName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="mcp-form-row">
                            <label>Transport / Endpoint URL</label>
                            <input 
                              type="text" 
                              className="setting-input" 
                              placeholder="e.g. http://localhost:3000/sse or stdio command" 
                              value={newMcpEndpoint}
                              onChange={e => setNewMcpEndpoint(e.target.value)}
                              required
                            />
                          </div>
                          <div className="mcp-form-row-duo">
                            <div>
                              <label>Category</label>
                              <select 
                                className="setting-select"
                                value={newMcpCategory}
                                onChange={e => setNewMcpCategory(e.target.value)}
                              >
                                <option value="Developer Tools">Developer Tools</option>
                                <option value="Data & Databases">Data & Databases</option>
                                <option value="Web & Network">Web & Network</option>
                                <option value="DevOps & System">DevOps & System</option>
                                <option value="Productivity">Productivity</option>
                              </select>
                            </div>
                            <div>
                              <label>Description (Optional)</label>
                              <input 
                                type="text" 
                                className="setting-input" 
                                placeholder="Brief capability summary" 
                                value={newMcpDesc}
                                onChange={e => setNewMcpDesc(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="mcp-form-actions">
                            <button type="button" className="mcp-cancel-btn" onClick={() => setShowAddMcpModal(false)}>Cancel</button>
                            <button type="submit" className="setting-add-btn">Save & Connect MCP</button>
                          </div>
                        </form>
                      </div>
                    )}

                    <div className="mcp-servers-grid">
                      {mcpIsLoading && mcpServers.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                          Connecting to Model Context Protocol daemon & discovering active tools...
                        </div>
                      )}
                      {mcpServers
                        .filter(server => {
                          const matchesCategory = mcpFilter === 'All' || server.category === mcpFilter
                          const q = mcpSearch.toLowerCase()
                          const matchesSearch = !q || 
                            server.name.toLowerCase().includes(q) || 
                            server.description.toLowerCase().includes(q) ||
                            (server.tools && server.tools.some(t => t.name.toLowerCase().includes(q) || t.display_name.toLowerCase().includes(q)))
                          return matchesCategory && matchesSearch
                        })
                        .map(server => {
                          const isExpanded = expandedMcpId === server.id
                          return (
                            <div key={server.id} className={`mcp-server-card ${isExpanded ? 'expanded' : ''}`}>
                              <div className="mcp-server-header" onClick={() => setExpandedMcpId(isExpanded ? null : server.id)}>
                                <div className="mcp-server-left">
                                  <span className="mcp-server-icon">{server.icon || '🔌'}</span>
                                  <div className="mcp-server-info">
                                    <div className="mcp-server-name-row">
                                      <span className="mcp-server-name">{server.name}</span>
                                      <span className="mcp-server-cat-tag">{server.category}</span>
                                    </div>
                                    <span className="mcp-server-desc">{server.description}</span>
                                  </div>
                                </div>

                                <div className="mcp-server-right">
                                  <span className={`mcp-server-status-pill ${server.status}`}>
                                    <span className="status-live-dot"></span>
                                    {server.status === 'connected' ? 'Connected' : 'Ready'}
                                  </span>

                                  <button 
                                    type="button" 
                                    className="mcp-tools-toggle-btn"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setExpandedMcpId(isExpanded ? null : server.id)
                                    }}
                                  >
                                    <span>{server.tools?.length || 0} Tools</span>
                                    <svg 
                                      width="12" 
                                      height="12" 
                                      viewBox="0 0 24 24" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="2.5"
                                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                                    >
                                      <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="mcp-server-tools-drawer">
                                  <div className="mcp-tools-drawer-heading">
                                    <span>AVAILABLE MCP TOOLS & ACTIONS</span>
                                    <span className="mcp-tools-proto-tag">Standard Model Context Protocol</span>
                                  </div>

                                  <div className="mcp-tools-list">
                                    {server.tools && server.tools.map((tool) => {
                                      const isRunning = mcpTestRunning === tool.name
                                      const testResult = mcpTestResult[tool.name]
                                      return (
                                        <div key={tool.name} className="mcp-tool-card">
                                          <div className="mcp-tool-top">
                                            <div className="mcp-tool-meta">
                                              <span className="mcp-tool-display-name">{tool.display_name}</span>
                                              <code className="mcp-tool-code-name">{tool.name}</code>
                                            </div>

                                            <button 
                                              type="button"
                                              className={`mcp-tool-run-btn ${isRunning ? 'running' : ''}`}
                                              disabled={isRunning}
                                              onClick={() => handleRunMcpTest(tool.name, tool.sample_args || {})}
                                              title="Execute tool with sample arguments to test live integration"
                                            >
                                              {isRunning ? (
                                                <>
                                                  <span className="mcp-run-spinner"></span>
                                                  <span>Running...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span>⚡ Test Tool</span>
                                                </>
                                              )}
                                            </button>
                                          </div>

                                          <div className="mcp-tool-desc">{tool.description}</div>

                                          {testResult && (
                                            <div className="mcp-tool-result-box">
                                              <div className="mcp-result-header">
                                                <span className="mcp-result-status-ok">● Live MCP Output</span>
                                                <button 
                                                  type="button" 
                                                  className="mcp-copy-result-btn"
                                                  onClick={() => navigator.clipboard.writeText(JSON.stringify(testResult, null, 2))}
                                                  title="Copy output to clipboard"
                                                >
                                                  Copy
                                                </button>
                                              </div>
                                              <pre className="mcp-result-pre">
                                                {JSON.stringify(testResult, null, 2)}
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* TAB 5: System Diagnostics */}
                {settingsTab === 'system' && (
                  <div className="settings-section">
                    <div className="system-telemetry-grid">
                      <div className="system-card">
                        <div className="sys-card-top">
                          <span className="sys-icon">🧠</span>
                          <span className="sys-status live">Active</span>
                        </div>
                        <div className="sys-title">Primary AI Engine</div>
                        <div className="sys-value">Google Gemini 3.5 Flash</div>
                        <div className="sys-desc">Low-latency multimodal reasoning with tool-calling support.</div>
                      </div>

                      <div className="system-card">
                        <div className="sys-card-top">
                          <span className="sys-icon">🎙️</span>
                          <span className="sys-status live">{latencyHud}</span>
                        </div>
                        <div className="sys-title">Neural TTS Engine</div>
                        <div className="sys-value">Microsoft Edge Neural</div>
                        <div className="sys-desc">Sub-second sentence streaming with dynamic pitch and emotion modulation.</div>
                      </div>

                      <div className="system-card">
                        <div className="sys-card-top">
                          <span className="sys-icon">🗄️</span>
                          <span className="sys-status live">Connected</span>
                        </div>
                        <div className="sys-title">Persistent Database</div>
                        <div className="sys-value">SQLite (jarvis.db)</div>
                        <div className="sys-desc">Stores user profiles, memories, and multi-turn conversation threads.</div>
                      </div>

                      <div className="system-card">
                        <div className="sys-card-top">
                          <span className="sys-icon">📚</span>
                          <span className="sys-status live">{documents.length} Docs</span>
                        </div>
                        <div className="sys-title">Dense Vector Store</div>
                        <div className="sys-value">ChromaDB Local RAG</div>
                        <div className="sys-desc">Multimodal chunk indexing across PDFs, transcripts, and notes.</div>
                      </div>
                    </div>

                    <div className="system-diagnostic-table-card">
                      <div className="diag-header">ENVIRONMENT DIAGNOSTICS</div>
                      <div className="diag-row">
                        <span className="diag-key">Backend Runtime</span>
                        <span className="diag-val">FastAPI 0.115 + Uvicorn (Daemon Mode)</span>
                      </div>
                      <div className="diag-row">
                        <span className="diag-key">Frontend Framework</span>
                        <span className="diag-val">Vite 8.3 + React 19 + TypeScript</span>
                      </div>
                      <div className="diag-row">
                        <span className="diag-key">Protocol Transport</span>
                        <span className="diag-val">Model Context Protocol (MCP) + LangChain</span>
                      </div>
                      <div className="diag-row">
                        <span className="diag-key">Current User Identity</span>
                        <span className="diag-val">{currentUser} (Autonomous Agent Session)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      )}

      {/* --- MODAL 3: NOTION DRAWER --- */}
      {activeModal === 'notion' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Notion Workspace</div>
              <button className="modal-close" onClick={() => setActiveModal('none')}>×</button>
            </div>
            <div className="modal-body">
              <div className="notion-add-box">
                <input 
                  type="text" 
                  className="setting-input"
                  placeholder="New task for Notion (e.g. 'Deploy production bundle')..."
                  value={notionTaskText}
                  onChange={e => setNotionTaskText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNotion()}
                />
                <button className="setting-add-btn" onClick={handleAddNotion}>Add Task</button>
              </div>
              {notionStatus && <div className="notion-status-msg">{notionStatus}</div>}

              <div className="notion-pages-title">Workspace Pages ({notionPages.length})</div>
              <div className="notion-pages-list">
                {notionPages.map((p, i) => (
                  <div key={i} className="notion-page-card">
                    <span className="page-icon">📄</span>
                    <span className="page-title">{p.title || 'Untitled'}</span>
                    <span className="page-type">{p.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: UNIVERSAL MULTIMODAL KNOWLEDGE FILES --- */}
      {activeModal === 'files' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog modal-dialog-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>📂</span>
                <span>Universal Multimodal Knowledge Hub</span>
              </div>
              <button className="modal-close" onClick={() => setActiveModal('none')}>×</button>
            </div>
            <div className="modal-body">
              <div className="files-upload-zone" onClick={() => docInputRef.current?.click()}>
                <input 
                  type="file"     
                  ref={docInputRef}               
                  onChange={handleDocUpload} 
                  accept=".pdf,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.mp4,.mov,.avi,.mkv,.txt,.md,.csv,.json"
                  style={{ display: 'none' }} 
                />
                <div className="upload-icon-wrapper">
                  {isUploading ? (
                    <div className="spinner-mini" style={{ width: 30, height: 30, borderWidth: 3 }} />
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  )}
                </div>
                <div className="upload-main-text">
                  {isUploading 
                    ? 'Ingesting, transcribing & indexing into ChromaDB...' 
                    : 'Click or drop files to ingest into Vector Knowledge Base'}
                </div>
                <div className="upload-badges-row">
                  <span className="upload-badge pdf-badge">📑 PDF (Tables & Diagrams)</span>
                  <span className="upload-badge audio-badge">🎙️ Audio / Meetings (Verbatim & Actions)</span>
                  <span className="upload-badge video-badge">🎬 Video (Scene-by-Scene Index)</span>
                </div>
              </div>

              <div className="files-section-header">
                <span className="files-count-badge">Indexed Documents ({documents.length})</span>
                <span className="files-refresh-hint">Vectorized in ChromaDB with multimodal chunks</span>
              </div>

              <div className="files-list">
                {documents.length === 0 ? (
                  <div className="files-empty-state">
                    <span className="empty-icon">📁</span>
                    <p>No knowledge documents ingested yet.</p>
                    <small>Upload PDF reports, audio recordings, or videos to expand Aisia's long-term intelligence.</small>
                  </div>
                ) : (
                  documents.map((doc, idx) => (
                    <div key={idx} className="file-item-card multimodal-item-card">
                      <div className="file-item-left">
                        <span className="file-icon-badge">{doc.icon || '📄'}</span>
                        <div className="file-details">
                          <div className="file-title-row">
                            <span className="file-name" title={doc.name}>{doc.name}</span>
                            {doc.type_label && (
                              <span className={`file-type-pill pill-${doc.type || 'text'}`}>{doc.type_label}</span>
                            )}
                          </div>
                          <div className="file-meta-row">
                            <span className="file-size">{doc.size_kb} KB</span>
                            {doc.modified && (
                              <span className="file-date">• {new Date(doc.modified * 1000).toLocaleDateString()}</span>
                            )}
                          </div>
                          {doc.summary && (
                            <div className="file-summary-preview">
                              <span className="sparkle-icon">✨</span>
                              <span className="summary-text">{doc.summary}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="file-item-actions">
                        {doc.has_transcript && (
                          <button 
                            className="doc-inspect-btn"
                            onClick={() => handleViewTranscript(doc.name)}
                            disabled={isLoadingTranscript}
                            title="Inspect generated transcript and scene index"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            <span>{doc.type === 'video' ? 'Scenes' : 'Transcript'}</span>
                          </button>
                        )}
                        <button 
                          className="doc-delete-btn" 
                          onClick={(e) => handleDeleteDoc(doc.name, e)}
                          title="Delete from knowledge base"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TRANSCRIPT / SCENE INDEX INSPECTOR MODAL --- */}
      {selectedDocTranscript && (
        <div className="modal-backdrop transcript-inspector-backdrop" onClick={() => setSelectedDocTranscript(null)}>
          <div className="modal-dialog transcript-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📜</span>
                <span className="transcript-title-text">{selectedDocTranscript.name}</span>
                <span className="transcript-tag">Multimodal Ingestion</span>
              </div>
              <div className="transcript-header-actions">
                <button 
                  className="transcript-copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedDocTranscript.content)
                    setCopiedTranscript(true)
                    setTimeout(() => setCopiedTranscript(false), 2000)
                  }}
                >
                  {copiedTranscript ? '✓ Copied!' : '📋 Copy All'}
                </button>
                <button className="modal-close" onClick={() => setSelectedDocTranscript(null)}>×</button>
              </div>
            </div>
            <div className="modal-body transcript-body">
              <pre className="transcript-content-box">
                {selectedDocTranscript.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
