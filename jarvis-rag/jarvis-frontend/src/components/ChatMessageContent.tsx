import React, { useState } from 'react'
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

  if (!text && (!sources || sources.length === 0)) {
    return isStreaming ? <span className="typing-cursor" /> : null
  }

  // Pre-parse artifacts to see if this message contains a multi-file project
  const detectedArtifacts = extractArtifactsFromText(text || '')
  const projectArtifact = detectedArtifacts.find(a => a.files && a.files.length > 1)

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

  // Parses inline formatting: **bold**, `code`, [1] citations, [text](url) links and PDF downloads
  const renderInlineElements = (content: string): React.ReactNode => {
    // Regex matches: [number], [text](url), **bold**, `code`
    const inlineRegex = /(\[(\d+)\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)/g
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
        // **bold**
        elements.push(
          <strong key={`bold-${m.index}`} className="markdown-strong">
            {m[7]}
          </strong>
        )
      } else if (m[8] && m[9]) {
        // `code`
        elements.push(
          <code key={`code-${m.index}`} className="markdown-inline-code">
            {m[9]}
          </code>
        )
      }

      lastPos = m.index + m[0].length
    }

    if (lastPos < content.length) {
      elements.push(content.substring(lastPos))
    }

    return elements.length > 0 ? elements : content
  }

  // Renders structural markdown: headers, tables, bullet lists, blockquotes
  const renderFormattedMarkdown = (content: string): React.ReactNode => {
    const lines = content.split('\n')
    const nodes: React.ReactNode[] = []
    let inList = false
    let listItems: React.ReactNode[] = []
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
        nodes.push(
          <h4 key={lineIdx} className="markdown-h4">
            {renderInlineElements(trimmed.slice(4))}
          </h4>
        )
        return
      }
      if (trimmed.startsWith('## ')) {
        flushList()
        nodes.push(
          <h3 key={lineIdx} className="markdown-h3">
            {renderInlineElements(trimmed.slice(3))}
          </h3>
        )
        return
      }
      if (trimmed.startsWith('# ')) {
        flushList()
        nodes.push(
          <h2 key={lineIdx} className="markdown-h2">
            {renderInlineElements(trimmed.slice(2))}
          </h2>
        )
        return
      }

      // Horizontal Divider
      if (trimmed === '---' || trimmed === '***') {
        flushList()
        nodes.push(<hr key={lineIdx} className="markdown-divider" />)
        return
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        flushList()
        nodes.push(
          <blockquote key={lineIdx} className="markdown-blockquote">
            {renderInlineElements(trimmed.slice(2))}
          </blockquote>
        )
        return
      }

      // Bullet lists
      if (trimmed.match(/^[-*•]\s+/)) {
        inList = true
        const itemText = trimmed.replace(/^[-*•]\s+/, '')
        listItems.push(
          <li key={lineIdx} className="markdown-list-item">
            {renderInlineElements(itemText)}
          </li>
        )
        return
      } else if (inList) {
        flushList()
      }

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
                        <polyline points="6 9 12 15 18 9"/>
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
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" y1="14" x2="21" y2="3"/>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
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

      {/* 4. MAIN REPORT & CODE CONTENT */}
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <div key={idx} className="rendered-text-segment">
              {renderFormattedMarkdown(part.content)}
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
      {isStreaming && <span className="typing-cursor" />}

      {/* 5. PERPLEXITY-STYLE PROACTIVE FOLLOW-UP QUESTIONS & NEXT STEPS */}
      {followUps && followUps.length > 0 && !isStreaming && (
        <div className="perplexity-followups-container">
          <div className="followups-title">
            <span className="followups-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
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
                    <line x1="7" y1="17" x2="17" y2="7"/>
                    <polyline points="7 7 17 7 17 17"/>
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
