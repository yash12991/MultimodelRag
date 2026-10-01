import React, { useState, useEffect, useRef } from 'react'
import type { Artifact } from '../CodingCanvas'
import type { ToolExecutionStep } from '../App'
import { extractArtifactsFromText } from '../utils/artifactParser'

export interface PerplexitySource {
  index: number
  title: string
  url: string
  domain: string
  snippet?: string
  favicon?: string
}

export interface CompareData {
  original: string
  edited: string
  title: string
  prompt: string
  download: string
  model?: string
  resolution?: string
}

export const BeforeAfterCompareCard: React.FC<{
  data: CompareData
  onSelectPrompt?: (p: string) => void
}> = ({ data, onSelectPrompt }) => {
  const [sliderPos, setSliderPos] = useState(50) // 0 to 100
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'result'>('slider')
  const [isDragging, setIsDragging] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    updatePos(e)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging || e.buttons === 1) {
      updatePos(e)
    }
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  const updatePos = (e: React.PointerEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const pct = Math.round((x / rect.width) * 100)
    setSliderPos(pct)
  }

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(data.prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const presets = [
    { label: "⚡ Cyberpunk Neon", query: "Transform into high-tech cyberpunk aesthetic with glowing neon lighting" },
    { label: "🌅 Golden Hour", query: "Bathe in warm golden hour sunlight with cinematic lens flare" },
    { label: "📸 Studio Portrait", query: "Professional high-fashion magazine studio lighting with sharp detail" },
    { label: "✨ Glamour Aesthetic", query: "High-end glamorous editorial fashion shoot with refined elegance" }
  ]

  return (
    <div className="compare-image-studio-card">
      {/* Studio Header Bar */}
      <div className="compare-studio-header">
        <div className="compare-studio-meta">
          <span className="compare-engine-badge">
            <span className="compare-pulse-pip" />
            {data.model || 'FLUX.1 Kontext Pro'}
          </span>
          <span className="compare-res-badge">{data.resolution || '1024×1024 UHD'}</span>
        </div>

        {/* View Mode Tabs */}
        <div className="compare-tabs">
          <button
            type="button"
            className={`compare-tab-btn ${viewMode === 'slider' ? 'active' : ''}`}
            onClick={() => setViewMode('slider')}
            title="Interactive Split Slider"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 8L22 12L18 16" /><path d="M6 8L2 12L6 16" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
            <span>Split Slider</span>
          </button>
          <button
            type="button"
            className={`compare-tab-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
            onClick={() => setViewMode('side-by-side')}
            title="Side by Side"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="8" height="18" rx="2" /><rect x="13" y="3" width="8" height="18" rx="2" /></svg>
            <span>Side-by-Side</span>
          </button>
          <button
            type="button"
            className={`compare-tab-btn ${viewMode === 'result' ? 'active' : ''}`}
            onClick={() => setViewMode('result')}
            title="Transformed Only"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            <span>Result</span>
          </button>
        </div>
      </div>

      {/* Main Comparison Canvas */}
      <div className="compare-canvas-area">
        {viewMode === 'slider' && (
          <div
            ref={containerRef}
            className="compare-slider-viewport"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Background: Edited Image */}
            <img src={data.edited} alt="Transformed Result" className="compare-img compare-img-edited" />

            {/* Foreground: Original Image clipped to slider percentage */}
            <div
              className="compare-overlay-layer"
              style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
            >
              <img src={data.original} alt="Original Asset" className="compare-img compare-img-original" />
            </div>

            {/* Glowing Draggable Laser Divider */}
            <div className="compare-divider-handle" style={{ left: `${sliderPos}%` }}>
              <div className="compare-divider-line" />
              <div className="compare-handle-knob">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                </svg>
              </div>
            </div>

            {/* Floating Labels */}
            <div className="compare-pill-label before-label">ORIGINAL</div>
            <div className="compare-pill-label after-label">TRANSFORMED</div>
          </div>
        )}

        {viewMode === 'side-by-side' && (
          <div className="compare-side-by-side-grid">
            <div className="compare-side-col">
              <div className="compare-side-badge">ORIGINAL</div>
              <img src={data.original} alt="Original" className="compare-side-img" />
            </div>
            <div className="compare-side-col">
              <div className="compare-side-badge highlight">TRANSFORMED (FLUX)</div>
              <img src={data.edited} alt="Transformed" className="compare-side-img" />
            </div>
          </div>
        )}

        {viewMode === 'result' && (
          <div className="compare-result-viewport">
            <img src={data.edited} alt="Transformed" className="compare-result-img" />
          </div>
        )}
      </div>

      {/* Studio Action Toolbar */}
      <div className="compare-studio-toolbar">
        <div className="compare-prompt-info">
          <span className="compare-prompt-quote">"{data.title || data.prompt}"</span>
          <button
            type="button"
            className="compare-mini-action-btn"
            onClick={handleCopyPrompt}
            title="Copy prompt"
          >
            {copiedPrompt ? "Copied!" : "Copy Prompt"}
          </button>
        </div>

        <div className="compare-action-buttons">
          <button
            type="button"
            className="compare-btn compare-btn-secondary"
            onClick={() => setLightboxOpen(true)}
            title="View Fullscreen"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
            <span>Zoom</span>
          </button>

          <a
            href={data.download || data.edited}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="compare-btn compare-btn-primary"
            title="Download Full Resolution"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            <span>Download UHD</span>
          </a>
        </div>
      </div>

      {/* Quick Iteration Prompt Pills */}
      <div className="compare-preset-presets-row">
        <span className="compare-presets-title">Quick Variations:</span>
        {presets.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            className="compare-preset-pill"
            onClick={() => onSelectPrompt?.(preset.query)}
            title={preset.query}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <div className="compare-lightbox-overlay" onClick={() => setLightboxOpen(false)}>
          <div className="compare-lightbox-modal" onClick={e => e.stopPropagation()}>
            <div className="compare-lightbox-header">
              <span>{data.title || 'FLUX.1 Kontext Pro Fullscreen Preview'}</span>
              <button
                type="button"
                className="compare-lightbox-close"
                onClick={() => setLightboxOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="compare-lightbox-body">
              <img src={data.edited} alt="Fullscreen View" className="compare-lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface NeuralGeneratingCanvasProps {
  mode: 'edit' | 'generate'
  prompt: string
}

export const NeuralGeneratingCanvas: React.FC<NeuralGeneratingCanvasProps> = ({ mode, prompt }) => {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 100)
    return () => clearInterval(timer)
  }, [])

  const seconds = elapsed / 10
  const progressPct = Math.min(96, Math.round((1 - Math.exp(-seconds / 2.8)) * 100))

  const phases = mode === 'edit'
    ? ["Analyzing composition & lighting", "Applying neural inpainting", "Refining high-resolution output"]
    : ["Parsing prompt semantics", "Synthesizing diffusion latents", "Finalizing 1024×1024 render"]

  const currentPhase = progressPct >= 70 ? phases[2] : (progressPct >= 35 ? phases[1] : phases[0])

  return (
    <div className="pro-image-loading-card">
      <div className="pro-loader-top-shimmer" />

      {/* Header */}
      <div className="pro-loader-header">
        <div className="pro-loader-badge">
          <span className="pro-loader-pulse-dot" />
          <span>{mode === 'edit' ? 'FLUX.1 Kontext' : 'FLUX.1 Diffusion'}</span>
        </div>
        <span className="pro-loader-timer">{(elapsed / 10).toFixed(1)}s</span>
      </div>

      {/* Center Minimalist Indicator & Content */}
      <div className="pro-loader-body">
        <div className="pro-loader-spinner-box">
          <div className="pro-loader-spinner-ring" />
          <span className="pro-loader-icon">✦</span>
        </div>

        <div className="pro-loader-info">
          <div className="pro-loader-title">
            {mode === 'edit' ? 'Editing image' : 'Generating image'}
          </div>
          <div className="pro-loader-prompt" title={prompt}>
            "{prompt}"
          </div>
        </div>
      </div>

      {/* Bottom Minimal Hairline Progress & Status */}
      <div className="pro-loader-footer">
        <div className="pro-loader-meta-row">
          <span className="pro-loader-phase">{currentPhase}...</span>
          <span className="pro-loader-pct">{progressPct}%</span>
        </div>
        <div className="pro-loader-track">
          <div className="pro-loader-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </div>
  )
}

interface ChatMessageContentProps {
  text: string
  isStreaming?: boolean
  toolSteps?: ToolExecutionStep[]
  sources?: PerplexitySource[]
  followUps?: string[]
  onOpenArtifact?: (artifact: Artifact) => void
  onSelectFollowUp?: (query: string) => void
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  text,
  isStreaming,
  toolSteps,
  sources,
  followUps,
  onOpenArtifact,
  onSelectFollowUp
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<string[]>([])

  const toggleStep = (id: string) => {
    setExpandedSteps(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  if (!text && (!sources || sources.length === 0) && (!toolSteps || toolSteps.length === 0)) {
    return isStreaming ? <span className="typing-cursor" /> : null
  }

  // Pre-parse artifacts to see if this message contains a multi-file project or documentation
  const detectedArtifacts = extractArtifactsFromText(text || '')
  const projectArtifact = detectedArtifacts.find(a => a.files && a.files.length > 1)
  const docArtifact = detectedArtifacts.find(a =>
    a.type === 'html' &&
    (a.title.toLowerCase().includes('document') ||
      a.title.toLowerCase().includes('report') ||
      a.title.toLowerCase().includes('doc') ||
      a.title.toLowerCase().includes('guide') ||
      a.title.toLowerCase().includes('specification') ||
      a.title.toLowerCase().includes('architecture') ||
      a.code.toLowerCase().includes('window.print()') ||
      a.code.toLowerCase().includes('table of contents') ||
      a.code.toLowerCase().includes('@media print'))
  )
  const videoArtifact = detectedArtifacts.find(a =>
    a.type === 'html' &&
    (a.title.toLowerCase().includes('video') ||
      a.title.toLowerCase().includes('presentation') ||
      a.title.toLowerCase().includes('movie') ||
      a.code.toLowerCase().includes('speechsynthesis') ||
      a.code.toLowerCase().includes('timeline-scrubber') ||
      a.code.toLowerCase().includes('video-player') ||
      a.code.toLowerCase().includes('scene-container') ||
      a.code.toLowerCase().includes('presentation-wrapper') ||
      a.code.toLowerCase().includes('play video') ||
      a.code.toLowerCase().includes('start presentation'))
  )

  // Split code blocks from text
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = []
  const codeBlockRegex = /```([a-zA-Z0-9_\-+ \t="'.]*)\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text || '')) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: (text || '').slice(lastIndex, match.index)
      })
    }
    const rawLangLine = (match[1] || '').trim()
    const firstWordLang = rawLangLine.split(/\s+/)[0]?.toLowerCase() || 'code'
    parts.push({
      type: 'code',
      language: firstWordLang,
      content: match[2].trim()
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < (text || '').length) {
    parts.push({
      type: 'text',
      content: (text || '').slice(lastIndex)
    })
  }

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleLaunchCanvas = (lang: string, code: string, idx: number) => {
    if (!onOpenArtifact) return

    if (projectArtifact && projectArtifact.files) {
      const matchingFile = projectArtifact.files.find(f => f.content.trim() === code.trim())
      onOpenArtifact({
        ...projectArtifact,
        activeFileName: matchingFile ? matchingFile.name : projectArtifact.activeFileName
      })
      return
    }

    if (detectedArtifacts.length > 0 && detectedArtifacts[idx]) {
      onOpenArtifact(detectedArtifacts[idx])
      return
    }

    const rawLang = lang.toLowerCase().trim()
    let type: Artifact['type'] = 'code'
    let title = `Artifact #${idx + 1}`

    if (rawLang === 'html' || rawLang === 'htm') {
      type = 'html'
      const titleMatch = code.match(/<title>(.*?)<\/title>/i)
      title = titleMatch ? titleMatch[1].trim() : 'Interactive Web App'
    } else if (rawLang === 'svg') {
      type = 'svg'
      title = 'Vector Graphic'
    } else if (rawLang === 'mermaid') {
      type = 'mermaid'
      title = 'System Architecture Diagram'
    } else if (rawLang === 'python' || rawLang === 'py') {
      type = 'python'
      title = 'Python Program'
    } else if (rawLang === 'typescript' || rawLang === 'ts' || rawLang === 'tsx') {
      type = 'typescript'
      title = 'TypeScript Module'
    } else if (rawLang === 'javascript' || rawLang === 'js' || rawLang === 'jsx') {
      type = 'javascript'
      title = 'JavaScript Component'
    } else if (rawLang === 'json') {
      type = 'json'
      title = 'JSON Schema / Data'
    }

    onOpenArtifact({
      id: `art-${Date.now()}-${idx}`,
      title,
      language: rawLang,
      code,
      type
    })
  }

  // Parses inline formatting: citations, links, bold, italics, code, strikethrough
  const renderInlineElements = (content: string): React.ReactNode => {
    // Matches: [num], [text](url), ***bold italic***, **bold**, __bold__, *italic*, _italic_, `code`, ~~strike~~
    const inlineRegex = /(\[(\d+)\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\))|(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\s\n](?:[^*\n]*?[^*\s\n])?)\*)|(_([^_\s\n](?:[^_\n]*?[^_\s\n])?)_)|(`([^`]+)`)|(~~([^~]+)~~)/g
    const elements: React.ReactNode[] = []
    let lastPos = 0
    let m: RegExpExecArray | null

    while ((m = inlineRegex.exec(content)) !== null) {
      if (m.index > lastPos) {
        elements.push(content.substring(lastPos, m.index))
      }

      if (m[1] && m[2]) {
        // Citation [number]
        const num = parseInt(m[2], 10)
        const matched = sources?.find(s => s.index === num)
        elements.push(
          <a
            key={`cite-${m.index}-${num}`}
            href={matched?.url || '#'}
            target={matched?.url ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="perplexity-citation-badge"
            title={matched ? `[${num}] ${matched.title} (${matched.domain})` : `Source [${num}]`}
          >
            {num}
          </a>
        )
      } else if (m[3] && m[4] && m[5]) {
        // [text](url) link
        const linkText = m[4]
        const href = m[5]
        const isPdf = href.toLowerCase().includes('.pdf') || href.includes('/pdf/')
        const isImage = href.toLowerCase().includes('.svg') || href.toLowerCase().includes('.png') || href.includes('/image/')

        if (isPdf) {
          elements.push(
            <a
              key={`pdf-btn-${m.index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-pdf-download-btn"
              title={`Download or view PDF: ${linkText}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <polyline points="9 15 12 18 15 15"></polyline>
              </svg>
              <span>{linkText}</span>
              <span className="pdf-badge-pill">PDF</span>
            </a>
          )
        } else if (isImage) {
          elements.push(
            <a
              key={`img-btn-${m.index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-image-download-btn"
              title={`Download or view image: ${linkText}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, flexShrink: 0 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{linkText}</span>
              <span className="image-badge-pill">IMG</span>
            </a>
          )
        } else {
          elements.push(
            <a
              key={`link-${m.index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="markdown-link"
            >
              {linkText}
            </a>
          )
        }
      } else if (m[6] && m[7]) {
        // ***bold italic***
        elements.push(
          <strong key={`bold-em-${m.index}`} className="markdown-strong markdown-em">
            <em>{m[7]}</em>
          </strong>
        )
      } else if ((m[8] && m[9]) || (m[10] && m[11])) {
        // **bold** or __bold__
        const boldText = m[9] || m[11]
        elements.push(
          <strong key={`bold-${m.index}`} className="markdown-strong">
            {boldText}
          </strong>
        )
      } else if ((m[12] && m[13]) || (m[14] && m[15])) {
        // *italic* or _italic_
        const italicText = m[13] || m[15]
        elements.push(
          <em key={`em-${m.index}`} className="markdown-em">
            {italicText}
          </em>
        )
      } else if (m[16] && m[17]) {
        // `code`
        elements.push(
          <code key={`code-${m.index}`} className="markdown-inline-code">
            {m[17]}
          </code>
        )
      } else if (m[18] && m[19]) {
        // ~~strike~~
        elements.push(
          <del key={`del-${m.index}`} className="markdown-strike">
            {m[19]}
          </del>
        )
      }

      lastPos = m.index + m[0].length
    }

    if (lastPos < content.length) {
      elements.push(content.substring(lastPos))
    }

    return elements.length > 0 ? elements : content
  }

  // Renders structural markdown: headers, tables, bullet lists, ordered lists, blockquotes
  const renderFormattedMarkdown = (content: string): React.ReactNode => {
    const lines = content.split('\n')
    const nodes: React.ReactNode[] = []
    let inList = false
    let listItems: React.ReactNode[] = []
    let inOrderedList = false
    let orderedListItems: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[][] = []

    const flushList = () => {
      if (inList && listItems.length > 0) {
        nodes.push(
          <ul key={`ul-${nodes.length}`} className="markdown-bullet-list">
            {listItems}
          </ul>
        )
        listItems = []
        inList = false
      }
    }

    const flushOrderedList = () => {
      if (inOrderedList && orderedListItems.length > 0) {
        nodes.push(
          <ol key={`ol-${nodes.length}`} className="markdown-ordered-list">
            {orderedListItems}
          </ol>
        )
        orderedListItems = []
        inOrderedList = false
      }
    }

    const flushTable = () => {
      if (inTable && tableRows.length > 0) {
        const headerRow = tableRows[0]
        const dataRows = tableRows.slice(1).filter(r => !r.every(c => c.match(/^[:\-\s]+$/)))
        nodes.push(
          <div key={`table-wrapper-${nodes.length}`} className="markdown-table-wrapper">
            <table className="markdown-table">
              <thead>
                <tr>
                  {headerRow.map((cell, cIdx) => (
                    <th key={cIdx}>{renderInlineElements(cell.trim())}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{renderInlineElements(cell.trim())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        tableRows = []
        inTable = false
      }
    }

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim()

      // Table row detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flushList()
        flushOrderedList()
        inTable = true
        const cells = trimmed.split('|').slice(1, -1)
        tableRows.push(cells)
        return
      } else if (inTable) {
        flushTable()
      }

      // Headers
      if (trimmed.startsWith('### ')) {
        flushList()
        flushOrderedList()
        nodes.push(
          <h4 key={lineIdx} className="markdown-h4">
            {renderInlineElements(trimmed.slice(4))}
          </h4>
        )
        return
      }
      if (trimmed.startsWith('## ')) {
        flushList()
        flushOrderedList()
        nodes.push(
          <h3 key={lineIdx} className="markdown-h3">
            {renderInlineElements(trimmed.slice(3))}
          </h3>
        )
        return
      }
      if (trimmed.startsWith('# ')) {
        flushList()
        flushOrderedList()
        nodes.push(
          <h2 key={lineIdx} className="markdown-h2">
            {renderInlineElements(trimmed.slice(2))}
          </h2>
        )
        return
      }

      // Compare Diffusion Images Interactive Studio Card
      const compareMatch = trimmed.match(/^\[\[COMPARE_DIFFUSION_IMAGES:\s*(\{.*?\})\]\]$/) ||
        trimmed.match(/\[\[COMPARE_DIFFUSION_IMAGES:\s*(\{.*?\})\]\]/)
      if (compareMatch) {
        flushList()
        flushOrderedList()
        try {
          const compData: CompareData = JSON.parse(compareMatch[1])
          nodes.push(
            <BeforeAfterCompareCard
              key={`comp-card-${lineIdx}`}
              data={compData}
              onSelectPrompt={onSelectFollowUp}
            />
          )
          return
        } catch (e) {
          console.error("Failed to parse compare data", e)
        }
      }

      // If comparison studio is present in the message, skip duplicate raw markdown image and links
      if (text?.includes('[[COMPARE_DIFFUSION_IMAGES:')) {
        if (trimmed.startsWith('![') ||
          trimmed.startsWith('[Download Edited HD Image') ||
          trimmed.startsWith('*Neural FLUX Kontext Pro Transformation Complete*')) {
          return
        }
      }

      // Markdown Image ![alt](url)
      const imgMatch = trimmed.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/)
      if (imgMatch) {
        flushList()
        flushOrderedList()
        const altText = imgMatch[1] || 'Generated AI Image'
        const imgSrc = imgMatch[2]
        nodes.push(
          <div key={`img-card-${lineIdx}`} className="rendered-diffusion-image-card">
            <div className="diffusion-image-wrapper">
              <img
                src={imgSrc}
                alt={altText}
                className="diffusion-image-element"
                loading="lazy"
              />
            </div>
            <div className="diffusion-image-footer">
              <div className="diffusion-image-info">
                <span className="diffusion-image-title">{altText}</span>
                <span className="diffusion-badge-pill">AI DIFFUSION</span>
              </div>
              <a
                href={imgSrc}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="diffusion-download-btn"
                title={`Download ${altText}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download High-Res</span>
              </a>
            </div>
          </div>
        )
        return
      }

      // Generating Diffusion Image Skeleton Placeholder
      const genImgMatch = trimmed.match(/^\[\[GENERATING_DIFFUSION_IMAGE(?::\s*(.*?))?\]\]$/) ||
        trimmed.match(/\[\[GENERATING_DIFFUSION_IMAGE(?::\s*([^\]]*))?\]\]/)
      if (genImgMatch) {
        flushList()
        flushOrderedList()
        const promptLabel = genImgMatch[1]?.trim() || 'Synthesizing Diffusion Artwork'
        nodes.push(
          <NeuralGeneratingCanvas
            key={`gen-img-${lineIdx}`}
            mode="generate"
            prompt={promptLabel}
          />
        )
        return
      }

      // Editing Diffusion Image Skeleton Placeholder
      const editImgMatch = trimmed.match(/^\[\[EDITING_DIFFUSION_IMAGE(?::\s*(.*?))?\]\]$/) ||
        trimmed.match(/\[\[EDITING_DIFFUSION_IMAGE(?::\s*([^\]]*))?\]\]/)
      if (editImgMatch) {
        flushList()
        flushOrderedList()
        const promptLabel = editImgMatch[1]?.trim() || 'Neural Inpainting & Transformation'
        nodes.push(
          <NeuralGeneratingCanvas
            key={`edit-img-${lineIdx}`}
            mode="edit"
            prompt={promptLabel}
          />
        )
        return
      }

      // Horizontal Divider
      if (trimmed === '---' || trimmed === '***') {
        flushList()
        flushOrderedList()
        nodes.push(<hr key={lineIdx} className="markdown-divider" />)
        return
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        flushList()
        flushOrderedList()
        nodes.push(
          <blockquote key={lineIdx} className="markdown-blockquote">
            {renderInlineElements(trimmed.slice(2))}
          </blockquote>
        )
        return
      }

      // Ordered lists (e.g. "1. ", "2. ")
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
      if (orderedMatch) {
        flushList()
        inOrderedList = true
        orderedListItems.push(
          <li key={lineIdx} className="markdown-ordered-item">
            {renderInlineElements(orderedMatch[2])}
          </li>
        )
        return
      }

      // Bullet lists (e.g. "* ", "- ", "• ")
      if (trimmed.match(/^[-*•]\s+/)) {
        flushOrderedList()
        inList = true
        const itemText = trimmed.replace(/^[-*•]\s+/, '')
        listItems.push(
          <li key={lineIdx} className="markdown-list-item">
            {renderInlineElements(itemText)}
          </li>
        )
        return
      }

      // Reset list state when hitting non-list lines
      if (inList) flushList()
      if (inOrderedList) flushOrderedList()

      // Empty line spacing
      if (!trimmed) {
        nodes.push(<div key={lineIdx} className="markdown-spacing" />)
        return
      }

      // Regular paragraph
      nodes.push(
        <p key={lineIdx} className="markdown-paragraph">
          {renderInlineElements(trimmed)}
        </p>
      )
    })

    flushList()
    flushOrderedList()
    flushTable()

    return nodes
  }

  return (
    <div className="chat-message-rendered">
      {/* 1. PERPLEXITY-STYLE AGENTIC TOOL EXECUTION BADGES */}
      {toolSteps && toolSteps.length > 0 && (
        <div className="agent-tool-steps-container">
          <div className="agent-tool-steps-list">
            {toolSteps.map((step) => {
              const isExpanded = expandedSteps.includes(step.id)
              return (
                <div
                  key={step.id}
                  className={`agent-tool-chip type-${step.type} ${isExpanded ? 'expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="agent-tool-chip-btn"
                    onClick={() => toggleStep(step.id)}
                    title="Click to inspect agentic tool steps and verified data sources"
                  >
                    <span className="agent-tool-icon">{step.icon}</span>
                    <span className="agent-tool-title">{step.title}</span>
                    <span className="agent-tool-arrow">→</span>
                    <span className="agent-tool-summary">{step.summary}</span>
                    <span className="agent-tool-chevron">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="agent-tool-details-dropdown">
                      {step.details && (
                        <div className="tool-detail-block">
                          <div className="tool-detail-heading">EXECUTION LOG & RETRIEVED DATA</div>
                          <pre className="tool-detail-pre">{step.details}</pre>
                        </div>
                      )}

                      {step.sources && step.sources.length > 0 && (
                        <div className="tool-sources-block">
                          <div className="tool-detail-heading">VERIFIED SOURCES & CITATIONS ({step.sources.length})</div>
                          <div className="tool-sources-list">
                            {step.sources.map((src, i) => (
                              <a
                                key={i}
                                href={src.url || '#'}
                                target={src.url ? '_blank' : undefined}
                                rel="noopener noreferrer"
                                className="tool-source-link"
                              >
                                <span className="source-domain-pill">{src.domain || 'Source'}</span>
                                <span className="source-title-text">{src.title}</span>
                                {src.url && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="source-ext-icon">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. PERPLEXITY-STYLE SOURCE CARDS DRAWER */}
      {sources && sources.length > 0 && (
        <div className="perplexity-sources-section">
          <div className="perplexity-sources-header">
            <span className="sources-header-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            </span>
            <span className="sources-header-title">Verified Sources</span>
            <span className="sources-count-pill">{sources.length} sources</span>
          </div>
          <div className="perplexity-sources-carousel">
            {sources.map((src) => (
              <a
                key={src.index}
                href={src.url || '#'}
                target={src.url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="perplexity-source-card"
                title={`${src.title}\n\n${src.snippet || ''}`}
              >
                <div className="source-card-top">
                  <div className="source-favicon-wrapper">
                    {src.favicon ? (
                      <img
                        src={src.favicon}
                        alt=""
                        className="source-favicon"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <span className="source-default-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                      </span>
                    )}
                  </div>
                  <span className="source-card-domain">{src.domain}</span>
                  <span className="source-card-index">{src.index}</span>
                </div>
                <div className="source-card-title">{src.title}</div>
                {src.snippet && (
                  <div className="source-card-snippet">{src.snippet}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 3. MULTI-FILE PROJECT BANNER */}
      {projectArtifact && onOpenArtifact && (
        <div className="chat-project-banner">
          <div className="chat-project-banner-info">
            <span className="project-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </span>
            <div>
              <div className="project-banner-title">{projectArtifact.title}</div>
              <div className="project-banner-sub">
                {projectArtifact.files?.length} linked files ({projectArtifact.files?.map(f => f.name).join(', ')})
              </div>
            </div>
          </div>
          <button
            type="button"
            className="chat-project-banner-btn"
            onClick={() => onOpenArtifact(projectArtifact)}
          >
            <span>Open Project in Canvas</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
        </div>
      )}

      {/* 3B. INTERACTIVE DOCUMENTATION & PDF ARTIFACT BANNER */}
      {docArtifact && !projectArtifact && onOpenArtifact && (
        <div className="chat-doc-banner">
          <div className="chat-doc-banner-info">
            <span className="doc-banner-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <div>
              <div className="doc-banner-title">{docArtifact.title}</div>
              <div className="doc-banner-sub">
                Interactive Technical Documentation • Table of Contents & Printable PDF Ready
              </div>
            </div>
          </div>
          <button
            type="button"
            className="chat-doc-banner-btn"
            onClick={() => onOpenArtifact(docArtifact)}
          >
            <span>Open Document in Canvas</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
        </div>
      )}

      {/* 3C. INTERACTIVE VIDEO PLAYER ARTIFACT BANNER */}
      {videoArtifact && !docArtifact && !projectArtifact && onOpenArtifact && (
        <div className="chat-video-banner">
          <div className="chat-video-banner-info">
            <span className="video-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </span>
            <div>
              <div className="video-banner-title">{videoArtifact.title}</div>
              <div className="video-banner-sub">
                Interactive Animated Video • Synced Voiceover & Multi-Scene Storyboard
              </div>
            </div>
          </div>
          <button
            type="button"
            className="chat-video-banner-btn"
            onClick={() => onOpenArtifact(videoArtifact)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Play Video in Canvas</span>
          </button>
        </div>
      )}

      {/* 4. MAIN REPORT & CODE CONTENT */}
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <div key={idx} className="rendered-text-segment">
              {renderFormattedMarkdown(part.content)}
            </div>
          )
        }

        const isSvgArtwork = (part.language || '').toLowerCase() === 'svg' || (part.content.trim().startsWith('<svg') && part.content.includes('</svg>'))

        if (isSvgArtwork) {
          return (
            <div key={idx} className="rendered-svg-artwork-container">
              <div className="svg-artwork-header">
                <div className="svg-header-left">
                  <div className="mac-window-controls">
                    <span className="mac-dot mac-dot-red" />
                    <span className="mac-dot mac-dot-yellow" />
                    <span className="mac-dot mac-dot-green" />
                  </div>
                  <div className="code-lang-label">
                    <span>AI VECTOR ARTWORK</span>
                  </div>
                </div>

                <div className="code-block-actions">
                  <button
                    type="button"
                    className="code-action-btn canvas-btn"
                    onClick={() => handleLaunchCanvas('svg', part.content, idx)}
                    title="Open in Live Interactive Canvas"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                    <span>Open in Canvas</span>
                  </button>

                  <button
                    type="button"
                    className="code-action-btn"
                    onClick={() => handleCopyCode(part.content, idx)}
                    title="Copy SVG"
                  >
                    {copiedIndex === idx ? (
                      <span className="copied-tag">✓ Copied</span>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy SVG</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div
                className="svg-artwork-stage"
                dangerouslySetInnerHTML={{ __html: part.content }}
              />
            </div>
          )
        }

        const isVisual = ['html', 'htm', 'svg', 'mermaid', 'jsx', 'tsx'].includes(
          (part.language || '').toLowerCase()
        )

        return (
          <div key={idx} className="rendered-code-block">
            <div className="code-block-header">
              <div className="code-header-left">
                <div className="mac-window-controls">
                  <span className="mac-dot mac-dot-red" />
                  <span className="mac-dot mac-dot-yellow" />
                  <span className="mac-dot mac-dot-green" />
                </div>
                <div className="code-lang-label">
                  <span>{(part.language || 'code').toUpperCase()}</span>
                </div>
              </div>

              <div className="code-block-actions">
                <button
                  type="button"
                  className="code-action-btn canvas-btn"
                  onClick={() => handleLaunchCanvas(part.language || 'code', part.content, idx)}
                  title="Open in Live Interactive Canvas"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>{isVisual ? 'Open in Canvas' : 'View Artifact'}</span>
                </button>

                <button
                  type="button"
                  className="code-action-btn"
                  onClick={() => handleCopyCode(part.content, idx)}
                  title="Copy code"
                >
                  {copiedIndex === idx ? (
                    <span className="copied-tag">✓ Copied</span>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <pre className="code-block-pre">
              <code>{part.content}</code>
            </pre>
          </div>
        )
      })}

      {/* 4B. RUNNING IMAGE GENERATION / EDITING SKELETON (IF TOOL STEP ACTIVE BEFORE TOKENS) */}
      {isStreaming &&
        !text?.includes('![') &&
        !text?.includes('[[GENERATING_DIFFUSION_IMAGE') &&
        !text?.includes('[[EDITING_DIFFUSION_IMAGE') &&
        !text?.includes('[[COMPARE_DIFFUSION_IMAGES') &&
        toolSteps?.some(s => s.type === 'image' && s.status === 'running') && (() => {
          const runningStep = toolSteps.find(s => s.type === 'image' && s.status === 'running')
          const isEditor = runningStep?.title?.includes('Editor') || runningStep?.title?.includes('Inpainting')
          const prompt = runningStep?.details?.split('\n')[0]?.replace('Instruction:', '')?.replace('Prompt:', '')?.trim() ||
            (isEditor ? 'Neural Inpainting Transformation' : 'Synthesizing Neural Artwork')
          return (
            <NeuralGeneratingCanvas
              mode={isEditor ? 'edit' : 'generate'}
              prompt={prompt}
            />
          )
        })()}

      {isStreaming && <span className="typing-cursor" />}

      {/* 5. PERPLEXITY-STYLE PROACTIVE FOLLOW-UP QUESTIONS & NEXT STEPS */}
      {followUps && followUps.length > 0 && !isStreaming && (
        <div className="perplexity-followups-container">
          <div className="followups-title">
            <span className="followups-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </span>
            <span>Explore Next & Follow-Up Tasks</span>
          </div>
          <div className="followups-list">
            {followUps.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="followup-pill-btn"
                onClick={() => onSelectFollowUp && onSelectFollowUp(q)}
                title={`Execute: "${q}"`}
              >
                <span className="followup-text">{q}</span>
                <span className="followup-arrow">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatMessageContent
