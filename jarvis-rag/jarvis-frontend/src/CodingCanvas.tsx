import React, { useState, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import { API_BASE_URL } from './config'

export interface ProjectFile {
  name: string
  language: string
  content: string
}

export interface Artifact {
  id: string
  title: string
  language: string
  code: string
  type: 'html' | 'svg' | 'mermaid' | 'javascript' | 'typescript' | 'python' | 'json' | 'code' | 'project'
  files?: ProjectFile[]
  activeFileName?: string
}

interface CodingCanvasProps {
  isOpen: boolean
  onClose: () => void
  artifact: Artifact | null
  speechLang?: string
  onUpdateCode?: (updatedCode: string) => void
  onUpdateArtifact?: (updatedArtifact: Artifact) => void
  onPromptAgent?: (prompt: string) => void
}

/**
 * Helper to deduce language mode from filename
 */
function getLanguageFromFileName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'css'
  if (['js', 'jsx', 'mjs'].includes(ext)) return 'javascript'
  if (['ts', 'tsx'].includes(ext)) return 'typescript'
  if (['json'].includes(ext)) return 'json'
  if (['py'].includes(ext)) return 'python'
  if (['svg'].includes(ext)) return 'svg'
  if (['mmd', 'mermaid'].includes(ext)) return 'mermaid'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  return 'text'
}

/**
 * Returns an icon for a file based on its extension
 */
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['html', 'htm'].includes(ext)) {
    return <span className="file-badge-tag html" title="HTML">HTML</span>
  }
  if (['css', 'scss'].includes(ext)) {
    return <span className="file-badge-tag css" title="CSS">CSS</span>
  }
  if (['js', 'jsx'].includes(ext)) {
    return <span className="file-badge-tag js" title="JavaScript">JS</span>
  }
  if (['ts', 'tsx'].includes(ext)) {
    return <span className="file-badge-tag ts" title="TypeScript">TS</span>
  }
  if (['json'].includes(ext)) {
    return <span className="file-badge-tag json" title="JSON">JSON</span>
  }
  if (['py'].includes(ext)) {
    return <span className="file-badge-tag py" title="Python">PY</span>
  }
  if (['svg'].includes(ext)) {
    return <span className="file-badge-tag svg" title="SVG">SVG</span>
  }
  if (['mmd', 'mermaid'].includes(ext)) {
    return <span className="file-badge-tag mmd" title="Mermaid">MMD</span>
  }
  return (
    <span className="file-badge-tag generic" title="File">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    </span>
  )
}

export const CodingCanvas: React.FC<CodingCanvasProps> = ({
  isOpen,
  onClose,
  artifact,
  speechLang = 'en-US',
  onUpdateCode,
  onUpdateArtifact,
  onPromptAgent
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [deviceView, setDeviceView] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  // Multi-File Project State
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [activeFileName, setActiveFileName] = useState<string>('')
  const [isAddingFile, setIsAddingFile] = useState(false)
  const [newFileNameInput, setNewFileNameInput] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // Speech Modification State
  const [isListening, setIsListening] = useState(false)
  const [instructionInput, setInstructionInput] = useState('')
  const [voiceNotification, setVoiceNotification] = useState<string>('')

  // GitHub Push State
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false)
  const [gitHubRepos, setGitHubRepos] = useState<any[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [newRepoName, setNewRepoName] = useState<string>('')
  const [commitMessage, setCommitMessage] = useState<string>('Build: initial implementation via Aisia Canvas')
  const [isPushingToGitHub, setIsPushingToGitHub] = useState(false)
  const [gitHubPushResult, setGitHubPushResult] = useState<{ success: boolean; message: string; url?: string } | null>(null)
  const [isCreatingNewRepo, setIsCreatingNewRepo] = useState(false)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  // Visual render state
  const [mermaidSvg, setMermaidSvg] = useState<string>('')
  const [mermaidError, setMermaidError] = useState<string>('')
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<any>(null)

  const handleTextareaScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false)
      }
    }
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isExportMenuOpen])

  const openGitHubModal = async () => {
    setIsGitHubModalOpen(true)
    setGitHubPushResult(null)
    const suggested = (artifact?.title || 'my-project')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'my-web-project'
    setNewRepoName(suggested)
    setIsLoadingRepos(true)
    try {
      const res = await fetch(`${API_BASE_URL}/github/repos`)
      if (res.ok) {
        const data = await res.json()
        const repos = data.repos || []
        setGitHubRepos(repos)
        if (repos.length > 0) {
          setSelectedRepo(repos[0].full_name)
          setIsCreatingNewRepo(false)
        } else {
          setIsCreatingNewRepo(true)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch repos', err)
      setIsCreatingNewRepo(true)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  const handlePushToGitHub = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetRepo = isCreatingNewRepo ? newRepoName.trim() : selectedRepo
    if (!targetRepo) return

    setIsPushingToGitHub(true)
    setGitHubPushResult(null)

    try {
      const payloadFiles = files.map(f => ({
        path: f.name,
        content: f.content
      }))

      const res = await fetch(`${API_BASE_URL}/github/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: targetRepo,
          files: payloadFiles,
          message: commitMessage || 'Update via Aisia Canvas',
          create_if_missing: true
        })
      })

      const data = await res.json()
      const text = data.result || ''
      if (text.includes('Successfully pushed')) {
        const urlMatch = text.match(/https:\/\/github\.com\/[^\s]+/)
        const repoUrl = urlMatch ? urlMatch[0] : `https://github.com/${targetRepo}`
        setGitHubPushResult({
          success: true,
          message: `Successfully pushed ${payloadFiles.length} file(s) to ${targetRepo}!`,
          url: repoUrl
        })
        setVoiceNotification(`Pushed ${payloadFiles.length} files to GitHub repository ${targetRepo}`)
      } else {
        setGitHubPushResult({
          success: false,
          message: text || 'Push failed. Please check repository name and permissions.'
        })
      }
    } catch (err: any) {
      setGitHubPushResult({
        success: false,
        message: err.message || 'Network error pushing to GitHub.'
      })
    } finally {
      setIsPushingToGitHub(false)
    }
  }


  // Initialize or synchronize files when artifact updates
  useEffect(() => {
    if (artifact) {
      let initialFiles: ProjectFile[] = []
      if (artifact.files && artifact.files.length > 0) {
        initialFiles = [...artifact.files]
      } else {
        const defaultExt = artifact.type === 'html' ? 'html' : artifact.language || 'txt'
        const defaultName = artifact.type === 'html' ? 'index.html' : `main.${defaultExt}`
        initialFiles = [{
          name: defaultName,
          language: artifact.language || 'html',
          content: artifact.code || ''
        }]
      }

      setFiles(initialFiles)
      const selected = artifact.activeFileName && initialFiles.some(f => f.name === artifact.activeFileName)
        ? artifact.activeFileName
        : (initialFiles.find(f => f.name === 'index.html')?.name || initialFiles.find(f => f.name.endsWith('.html'))?.name || initialFiles[0]?.name || 'index.html')
      setActiveFileName(selected)

      // Default to preview tab for HTML, SVG, and Mermaid
      const isPreviewable = ['html', 'svg', 'mermaid', 'project'].includes(artifact.type) ||
        initialFiles.some(f => f.name.endsWith('.html') || f.language === 'html')
      if (isPreviewable) {
        setActiveTab('preview')
      } else {
        setActiveTab('code')
      }
    }
  }, [artifact?.id, artifact?.title, artifact?.files, artifact?.activeFileName])

  // Listen for multi-page site navigation events (<a href="about.html">) from preview iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'AISIA_NAVIGATE_PAGE' && e.data.filename) {
        const target = e.data.filename
        const fileExists = files.some(f => f.name.toLowerCase() === target.toLowerCase())
        if (fileExists) {
          const matched = files.find(f => f.name.toLowerCase() === target.toLowerCase())!
          setActiveFileName(matched.name)
          setActiveTab('preview')
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [files])

  // Get active file object
  const activeFile = files.find(f => f.name === activeFileName) || files[0] || {
    name: 'index.html',
    language: 'html',
    content: ''
  }

  // Handle Code changes in active file
  const handleCodeChange = (newContent: string) => {
    const updatedFiles = files.map(f => 
      f.name === activeFileName ? { ...f, content: newContent } : f
    )
    setFiles(updatedFiles)

    if (onUpdateCode) {
      onUpdateCode(newContent)
    }

    if (onUpdateArtifact && artifact) {
      onUpdateArtifact({
        ...artifact,
        files: updatedFiles,
        code: activeFileName.endsWith('.html') ? newContent : artifact.code,
        activeFileName
      })
    }
  }

  // Handle Adding a New File
  const handleAddNewFile = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newFileNameInput.trim()
    if (!trimmed) return

    // Ensure extension exists
    const finalName = trimmed.includes('.') ? trimmed : `${trimmed}.js`

    if (files.some(f => f.name.toLowerCase() === finalName.toLowerCase())) {
      alert(`A file named "${finalName}" already exists.`)
      return
    }

    const lang = getLanguageFromFileName(finalName)
    let boilerplate = ''
    if (lang === 'css') boilerplate = `/* Styles for ${finalName} */\n`
    else if (lang === 'javascript') boilerplate = `// Logic for ${finalName}\n`
    else if (lang === 'html') boilerplate = `<!-- Template: ${finalName} -->\n<div>\n  \n</div>\n`

    const newFile: ProjectFile = {
      name: finalName,
      language: lang,
      content: boilerplate
    }

    const updated = [...files, newFile]
    setFiles(updated)
    setActiveFileName(finalName)
    setIsAddingFile(false)
    setNewFileNameInput('')
    setActiveTab('code')

    if (onUpdateArtifact && artifact) {
      onUpdateArtifact({
        ...artifact,
        files: updated,
        activeFileName: finalName
      })
    }
  }

  // Handle Deleting a File
  const handleDeleteFile = (fileNameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (files.length <= 1) {
      alert('You cannot delete the only file in the project.')
      return
    }

    if (!confirm(`Are you sure you want to delete "${fileNameToDelete}"?`)) {
      return
    }

    const updated = files.filter(f => f.name !== fileNameToDelete)
    setFiles(updated)
    if (activeFileName === fileNameToDelete) {
      setActiveFileName(updated[0]?.name || '')
    }

    if (onUpdateArtifact && artifact) {
      onUpdateArtifact({
        ...artifact,
        files: updated,
        activeFileName: updated[0]?.name || ''
      })
    }
  }

  // Handle Mermaid Diagram Rendering
  useEffect(() => {
    if (artifact?.type === 'mermaid' && activeFile.content) {
      const renderMermaid = async () => {
        try {
          const cdn = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'
          const mermaid = (window as any).mermaid || (await (Function('u', 'return import(u)')(cdn))).default
          ;(window as any).mermaid = mermaid
          mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif'
          })
          const id = `mermaid-${Date.now()}`
          const { svg } = await mermaid.render(id, activeFile.content)
          setMermaidSvg(svg)
          setMermaidError('')
        } catch (err: any) {
          console.warn('Mermaid render error:', err)
          setMermaidError(err.message || 'Syntax error in Mermaid diagram')
        }
      }
      renderMermaid()
    }
  }, [artifact?.type, activeFile.content])

  // Web Speech API: Dictate changes to Canvas by speech
  const toggleSpeechRecognition = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (_) {}
      }
      setIsListening(false)
      setVoiceNotification('')
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Google Chrome, Brave, or Edge.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = speechLang || 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
        setVoiceNotification('Listening... Speak your modifications clearly.')
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript
          } else {
            interim += event.results[i][0].transcript
          }
        }

        const transcript = (final || interim).trim()
        if (transcript) {
          setInstructionInput(transcript)
          setVoiceNotification(`Heard: "${transcript}"`)

          // Silence timeout: auto-send after 1.8s silence if user spoke something substantive
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          if (final.length > 5) {
            silenceTimerRef.current = setTimeout(() => {
              if (recognitionRef.current) {
                try { recognitionRef.current.stop() } catch (_) {}
              }
              setIsListening(false)
              dispatchModificationPrompt(transcript)
            }, 1800)
          }
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Canvas voice recognition error:', event)
        setIsListening(false)
        setVoiceNotification('')
      }

      recognition.onend = () => {
        setIsListening(false)
        setVoiceNotification('')
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.error('Failed to start speech recognition:', err)
      setIsListening(false)
      setVoiceNotification('')
    }
  }

  // Dispatch modification prompt to Coding Agent
  const dispatchModificationPrompt = (instructionText: string) => {
    const text = instructionText.trim()
    if (!text || !onPromptAgent || !artifact) return

    const filesList = files.map(f => `- ${f.name} (${f.language})`).join('\n')
    const activeContent = activeFile.content

    const structuredPrompt = `[Multi-File Project: "${artifact.title}" | Active File: "${activeFile.name}"]
Project File Tree:
${filesList}

Voice/Speech Modification Request:
"${text}"

Current Active File (${activeFile.name}):
\`\`\`${activeFile.language}
${activeContent}
\`\`\`

Please apply the requested modification to the project. If modifying existing files or adding new files (e.g. styles.css, app.js), output each complete updated file inside a markdown code block with the filename comment in the first line (e.g. <!-- filename: index.html --> or /* filename: styles.css */ or // filename: app.js).`

    onPromptAgent(structuredPrompt)
    setInstructionInput('')
    setVoiceNotification('Modification sent to Coding Agent!')
    setTimeout(() => setVoiceNotification(''), 3000)
  }

  const handleSendModification = (e: React.FormEvent) => {
    e.preventDefault()
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
      setIsListening(false)
    }
    dispatchModificationPrompt(instructionInput)
  }

  if (!isOpen || !artifact) return null

  const isReactCapable = files.some(f => 
    f.name.endsWith('.tsx') || 
    f.name.endsWith('.jsx') || 
    f.language === 'jsx' || 
    f.language === 'tsx' ||
    f.content.includes('import React') ||
    f.content.includes("from 'react'") ||
    f.content.includes('from "react"') ||
    f.content.includes('export default function') ||
    f.content.includes('className=')
  )

  const isHtmlCapable = artifact.type === 'html' || 
    artifact.type === 'project' || 
    isReactCapable ||
    files.some(f => f.name.endsWith('.html') || f.language === 'html')

  const isPreviewable = isHtmlCapable || ['svg', 'mermaid'].includes(artifact.type)

  const handleCopyCurrent = () => {
    navigator.clipboard.writeText(activeFile.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadZip = async () => {
    try {
      const zip = new JSZip()
      files.forEach(f => {
        zip.file(f.name, f.content)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(artifact?.title || 'project').replace(/\s+/g, '_').toLowerCase()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to create ZIP:', err)
      alert('Could not export ZIP. Falling back to HTML bundle.')
      handleDownloadBundle()
    }
  }

  const handleDownloadBundle = () => {
    // If multi-file with HTML, package everything into a self-contained HTML bundle
    if (isHtmlCapable) {
      const bundleHtml = getHtmlSrcDoc()
      const blob = new Blob([bundleHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(artifact?.title || 'project').replace(/\s+/g, '_').toLowerCase()}_bundle.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      // Download active file
      const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = activeFile.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const handlePrintPdf = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus()
        iframeRef.current.contentWindow.print()
      } catch (err) {
        console.warn('Iframe print failed, opening print window:', err)
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          printWindow.document.write(getHtmlSrcDoc())
          printWindow.document.close()
          printWindow.focus()
          setTimeout(() => {
            printWindow.print()
            printWindow.close()
          }, 350)
        }
      }
    }
  }

  const handleRunCode = () => {
    if (iframeRef.current && isHtmlCapable) {
      iframeRef.current.srcdoc = getHtmlSrcDoc()
    }
  }

  // Compile multi-file source doc (bundles HTML + CSS + JS + Assets + Router in real-time)
  const getHtmlSrcDoc = (targetHtmlName?: string) => {
    // 1. Locate HTML file to render
    const currentName = targetHtmlName || activeFileName
    let htmlFile = files.find(f => f.name === currentName && (f.name.endsWith('.html') || f.language === 'html'))
    
    // If active file is not an HTML file, prefer index.html or the first HTML file
    if (!htmlFile) {
      htmlFile = files.find(f => f.name === 'index.html') ||
                 files.find(f => f.name.endsWith('.html') || f.language === 'html') ||
                 files[0]
    }

    let baseHtml = htmlFile ? htmlFile.content : ''

    if (!baseHtml.includes('<!DOCTYPE html>') && !baseHtml.includes('<html')) {
      baseHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${artifact?.title || 'Interactive Canvas'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #f4f4f5; }
  </style>
</head>
<body>
  ${baseHtml}
</body>
</html>`
    }

    // Map of all project files for fast, case-insensitive lookup
    const fileMap = new Map<string, ProjectFile>()
    files.forEach(f => {
      fileMap.set(f.name.toLowerCase(), f)
      fileMap.set(f.name.toLowerCase().replace(/^\.\//, ''), f)
    })

    const sanitizeCss = (raw: string) => {
      return (raw || '')
        .replace(/@import\s+["']tailwindcss["'];?/gi, '')
        .replace(/@tailwind\s+[a-zA-Z]+;?/gi, '')
    }

    // 2. Resolve & inline <link rel="stylesheet" href="..."> or <link href="..." rel="stylesheet"> tags
    const injectedCssFiles = new Set<string>()

    baseHtml = baseHtml.replace(/<link\s+[^>]*?(?:rel=["']stylesheet["']|href=["'][^"']+\.css["'])[^>]*?>/gi, (match) => {
      const hrefMatch = match.match(/href=["']([^"']+)["']/i)
      if (hrefMatch && hrefMatch[1]) {
        const rawHref = hrefMatch[1].trim()
        // If it's an external CDN link, preserve it!
        if (rawHref.startsWith('http://') || rawHref.startsWith('https://') || rawHref.startsWith('//')) {
          return match
        }
        const cleanHref = rawHref.replace(/^\.\//, '').toLowerCase()
        let matched = fileMap.get(cleanHref)
        if (!matched && (cleanHref.endsWith('.css') || cleanHref.includes('style'))) {
          matched = files.find(f => f.name.endsWith('.css') || f.language === 'css')
        }
        if (matched) {
          injectedCssFiles.add(matched.name)
          return `<style data-filename="${matched.name}">\n${sanitizeCss(matched.content)}\n</style>`
        }
      }
      return '' // eliminate 404 broken stylesheet link
    })

    // Also inject any remaining CSS files not explicitly linked in the HTML
    const remainingCss = files.filter(f => 
      (f.name.endsWith('.css') || f.language === 'css') && 
      !injectedCssFiles.has(f.name)
    )
    if (remainingCss.length > 0) {
      const extraStyles = remainingCss.map(css => 
        `\n  <style data-filename="${css.name}">\n${sanitizeCss(css.content)}\n  </style>`
      ).join('')
      if (baseHtml.includes('</head>')) {
        baseHtml = baseHtml.replace('</head>', `${extraStyles}\n</head>`)
      } else {
        baseHtml = `${extraStyles}\n${baseHtml}`
      }
    }

    // Check if this project uses React, TSX, JSX, or Tailwind
    const isReactProject = files.some(f => 
      f.name.endsWith('.tsx') || 
      f.name.endsWith('.jsx') || 
      f.language === 'jsx' || 
      f.language === 'tsx' ||
      f.content.includes('import React') ||
      f.content.includes("from 'react'") ||
      f.content.includes('from "react"') ||
      f.content.includes('export default function')
    )

    const usesTailwind = isReactProject || files.some(f => 
      f.content.includes('tailwindcss') ||
      (f.content.includes('class="') && (
        f.content.includes('flex') || 
        f.content.includes('bg-') || 
        f.content.includes('grid') || 
        f.content.includes('text-') ||
        f.content.includes('border-') ||
        f.content.includes('p-') ||
        f.content.includes('m-') ||
        f.content.includes('max-w-')
      ))
    )

    // Ensure root container exists for React components
    if (isReactProject && !baseHtml.includes('id="root"')) {
      if (baseHtml.includes('</body>')) {
        baseHtml = baseHtml.replace('</body>', '\n  <div id="root"></div>\n</body>')
      } else {
        baseHtml += '\n<div id="root"></div>'
      }
    }

    // Auto-inject Tailwind CSS CDN into <head> if needed
    if (usesTailwind && !baseHtml.includes('cdn.tailwindcss.com')) {
      const tailwindTag = '\n  <script src="https://cdn.tailwindcss.com"></script>'
      if (baseHtml.includes('</head>')) {
        baseHtml = baseHtml.replace('</head>', `${tailwindTag}\n</head>`)
      } else {
        baseHtml = `${tailwindTag}\n${baseHtml}`
      }
    }

    // Inject ESM Import Map & Babel Standalone compiler for React & TSX components
    if (isReactProject) {
      const reactDeps = `
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react/": "https://esm.sh/react@18.2.0/",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
      "lucide-react": "https://esm.sh/lucide-react@0.359.0",
      "framer-motion": "https://esm.sh/framer-motion@11.0.8",
      "recharts": "https://esm.sh/recharts@2.12.3",
      "canvas-confetti": "https://esm.sh/canvas-confetti@1.9.2"
    }
  }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js"></script>
`
      if (baseHtml.includes('</head>')) {
        baseHtml = baseHtml.replace('</head>', `${reactDeps}\n</head>`)
      } else {
        baseHtml = `${reactDeps}\n${baseHtml}`
      }
    }

    // 3. Resolve & inline JavaScript, JSX, and TSX files
    const injectedJsFiles = new Set<string>()

    baseHtml = baseHtml.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
      const rawSrc = (src || '').trim()
      if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('//')) {
        return match // preserve external CDN libraries like three.js, d3, etc.
      }
      const cleanSrc = rawSrc.replace(/^\.\//, '').toLowerCase()
      let matched = fileMap.get(cleanSrc)
      if (!matched && (cleanSrc.endsWith('.js') || cleanSrc.endsWith('.ts') || cleanSrc.endsWith('.jsx') || cleanSrc.endsWith('.tsx') || cleanSrc.includes('script') || cleanSrc.includes('app'))) {
        matched = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx') || f.language === 'javascript' || f.language === 'typescript')
      }
      if (matched) {
        injectedJsFiles.add(matched.name)
        const isBabel = matched.name.endsWith('.tsx') || matched.name.endsWith('.jsx') || matched.content.includes('import React') || matched.content.includes('export default')
        const scriptType = isBabel ? 'type="text/babel" data-type="module" data-presets="react,typescript"' : ''
        return `<script ${scriptType} data-filename="${matched.name}">\n${matched.content.replace(/<\/script/gi, '<\\/script')}\n</script>`
      }
      return '' // eliminate 404 broken script link
    })

    // Also inject any remaining JS/TS/JSX/TSX files not explicitly linked
    const remainingScripts = files.filter(f => 
      f.name !== htmlFile?.name && 
      (f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx') || f.language === 'javascript' || f.language === 'typescript') &&
      !injectedJsFiles.has(f.name)
    )

    if (remainingScripts.length > 0) {
      const scriptTags = remainingScripts.map(scriptFile => {
        const isBabel = scriptFile.name.endsWith('.tsx') || scriptFile.name.endsWith('.jsx') || scriptFile.content.includes('import React') || scriptFile.content.includes('export default') || scriptFile.content.includes('className=')
        let codeToInject = scriptFile.content.replace(/<\/script/gi, '<\\/script')

        // If this is a React component with an export default and no explicit mount, auto-mount to #root
        if (isBabel) {
          const exportMatch = codeToInject.match(/export\s+default\s+(?:function\s+([a-zA-Z0-9_$]+)|class\s+([a-zA-Z0-9_$]+)|([a-zA-Z0-9_$]+))/i)
          const compName = exportMatch ? (exportMatch[1] || exportMatch[2] || exportMatch[3]) : 'App'
          if (!codeToInject.includes('createRoot(') && !codeToInject.includes('ReactDOM.render(')) {
            codeToInject += `
\n// Auto-mount React Component to Canvas root container
import React from 'react';
import { createRoot } from 'react-dom/client';
setTimeout(() => {
  try {
    const TargetComp = typeof ${compName} !== 'undefined' ? ${compName} : (typeof App !== 'undefined' ? App : null);
    const rootEl = document.getElementById('root');
    if (TargetComp && rootEl && !rootEl.__mounted) {
      rootEl.__mounted = true;
      const root = createRoot(rootEl);
      root.render(React.createElement(TargetComp));
    }
  } catch (err) {
    console.error('React mounting error:', err);
  }
}, 50);
`
          }
        }

        const scriptType = isBabel ? 'type="text/babel" data-type="module" data-presets="react,typescript"' : ''
        return `\n  <script ${scriptType} data-filename="${scriptFile.name}">\n${codeToInject}\n  </script>`
      }).join('')

      if (baseHtml.includes('</body>')) {
        baseHtml = baseHtml.replace('</body>', `${scriptTags}\n</body>`)
      } else {
        baseHtml = `${baseHtml}\n${scriptTags}`
      }
    }

    // 4. Resolve local SVG image assets: <img src="logo.svg">
    files.filter(f => f.name.endsWith('.svg') || f.language === 'svg').forEach(svg => {
      const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(svg.content)}`
      const escapedName = svg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(src=["'])(\\./)?${escapedName}(["'])`, 'gi')
      baseHtml = baseHtml.replace(regex, `$1${encoded}$3`)
    })

    // Global runtime error badge for quick visual feedback
    const errorListenerScript = `
<script>
// Graceful fallback for broken image URLs
document.addEventListener('error', function(e) {
  if (e.target && e.target.tagName === 'IMG' && !e.target.__fallbackApplied) {
    e.target.__fallbackApplied = true;
    e.target.style.background = '#1e293b';
    e.target.style.objectFit = 'cover';
  }
}, true);

window.addEventListener('error', function(e) {
  // Ignore resource load failures (images, stylesheets, fonts) and cross-origin "Script error."
  if (e.target && e.target !== window && (e.target.tagName === 'IMG' || e.target.tagName === 'LINK' || e.target.tagName === 'SCRIPT')) {
    return;
  }
  if (!e.message || e.message === 'Script error.' || e.message === 'Script error') {
    return;
  }
  var b = document.getElementById('__canvas_err_badge');
  if (!b) {
    b = document.createElement('div');
    b.id = '__canvas_err_badge';
    b.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:rgba(239,68,68,0.92);color:#fff;padding:8px 12px;border-radius:8px;font-family:monospace;font-size:12px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;justify-content:space-between;align-items:center;';
    var msg = document.createElement('span');
    msg.textContent = 'Runtime note: ' + e.message;
    var btn = document.createElement('button');
    btn.textContent = '✕';
    btn.style.cssText = 'background:none;border:none;color:#fff;font-weight:bold;cursor:pointer;margin-left:12px;';
    btn.onclick = function() { b.remove(); };
    b.appendChild(msg);
    b.appendChild(btn);
    document.body.appendChild(b);
  }
});
</script>
`
    if (baseHtml.includes('</body>')) {
      baseHtml = baseHtml.replace('</body>', `${errorListenerScript}\n</body>`)
    } else {
      baseHtml = `${baseHtml}\n${errorListenerScript}`
    }

    // 5. Inject Virtual Filesystem (for mock fetch on local data.json) & Client Router (for <a href="about.html">)
    const virtualFilesMap: Record<string, { name: string; content: string; language: string }> = {}
    files.forEach(f => {
      virtualFilesMap[f.name.toLowerCase()] = { name: f.name, content: f.content, language: f.language }
    })

    const safeVirtualFilesJson = JSON.stringify(virtualFilesMap)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')

    const runtimeScript = `
<script id="aisia-multi-file-runtime">
(function() {
  var virtualFiles = ${safeVirtualFilesJson};

  // Intercept fetch for local mock files (JSON, CSV, SVG, TXT)
  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var clean = url.replace(/^\\.\\//, '').replace(/^https?:\\/\\/[^\\/]+\\//, '').split('?')[0].split('#')[0].toLowerCase();
    if (virtualFiles[clean]) {
      var f = virtualFiles[clean];
      var mime = clean.endsWith('.json') ? 'application/json' : (clean.endsWith('.svg') ? 'image/svg+xml' : 'text/plain');
      return Promise.resolve(new Response(f.content, {
        status: 200,
        headers: { 'Content-Type': mime }
      }));
    }
    return _origFetch ? _origFetch.apply(this, arguments) : Promise.reject('fetch unavailable');
  };

  // Intercept relative page navigation (<a href="about.html">, <a href="./contact.html">)
  document.addEventListener('click', function(e) {
    var target = e.target.closest('a');
    if (!target) return;
    var href = target.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return;

    var cleanHref = href.replace(/^\\.\\//, '').split('#')[0].split('?')[0].toLowerCase();
    if (virtualFiles[cleanHref]) {
      e.preventDefault();
      window.parent.postMessage({ type: 'AISIA_NAVIGATE_PAGE', filename: virtualFiles[cleanHref].name }, '*');
    }
  }, true);
})();
</script>
`

    if (baseHtml.includes('</body>')) {
      baseHtml = baseHtml.replace('</body>', `${runtimeScript}\n</body>`)
    } else {
      baseHtml = `${baseHtml}\n${runtimeScript}`
    }

    return baseHtml
  }

  return (
    <aside className={`coding-canvas-panel ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Top Header Bar */}
      <header className="canvas-header">
        <div className="canvas-header-left">
          <div className="canvas-badge-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div className="canvas-title-group">
            <span className="canvas-title" title={artifact.title}>{artifact.title}</span>
            <span className="canvas-lang-badge">
              {files.length > 1 ? `${files.length} files` : (activeFile.language || 'CODE').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Tab Switcher (Preview vs Code) */}
        {isPreviewable && (
          <div className="canvas-tabs">
            <button 
              className={`canvas-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
              <span>Preview</span>
            </button>
            <button 
              className={`canvas-tab-btn ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>Code</span>
            </button>
          </div>
        )}

        {/* Device Switcher (Desktop / Tablet / Mobile) when viewing HTML */}
        {activeTab === 'preview' && isHtmlCapable && (
          <div className="device-switcher">
            <button 
              className={`device-btn ${deviceView === 'desktop' ? 'active' : ''}`}
              onClick={() => setDeviceView('desktop')}
              title="Desktop View"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
            <button 
              className={`device-btn ${deviceView === 'tablet' ? 'active' : ''}`}
              onClick={() => setDeviceView('tablet')}
              title="Tablet View (768px)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </button>
            <button 
              className={`device-btn ${deviceView === 'mobile' ? 'active' : ''}`}
              onClick={() => setDeviceView('mobile')}
              title="Mobile View (375px)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Streamlined Clean Header Actions */}
        <div className="canvas-header-right">
          {isPreviewable && (
            <button className="canvas-icon-btn" onClick={handleRunCode} title="Refresh / Run Live Preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          )}

          <button className="canvas-icon-btn" onClick={handleCopyCurrent} title={`Copy ${activeFile.name}`}>
            {copied ? (
              <span className="copied-text">✓ Copied</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>

          {/* Consolidated Export Dropdown */}
          <div className="canvas-export-wrapper" ref={exportMenuRef}>
            <button 
              type="button" 
              className={`canvas-export-btn ${isExportMenuOpen ? 'active' : ''}`}
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              title="Export, download or push code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExportMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {isExportMenuOpen && (
              <div className="canvas-export-dropdown">
                {files.length > 1 && (
                  <button 
                    type="button"
                    className="export-dropdown-item" 
                    onClick={() => { handleDownloadZip(); setIsExportMenuOpen(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    <div>
                      <div className="export-item-title">Download ZIP</div>
                      <div className="export-item-desc">All {files.length} project files</div>
                    </div>
                  </button>
                )}

                <button 
                  type="button"
                  className="export-dropdown-item" 
                  onClick={() => { handleDownloadBundle(); setIsExportMenuOpen(false); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <div>
                    <div className="export-item-title">Download {files.length > 1 ? 'Bundle HTML' : activeFile.name}</div>
                    <div className="export-item-desc">Single runnable file</div>
                  </div>
                </button>

                <button 
                  type="button"
                  className="export-dropdown-item" 
                  onClick={() => { openGitHubModal(); setIsExportMenuOpen(false); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <div>
                    <div className="export-item-title">Push to GitHub</div>
                    <div className="export-item-desc">Commit directly to repository</div>
                  </div>
                </button>

                {isHtmlCapable && (
                  <button 
                    type="button"
                    className="export-dropdown-item" 
                    onClick={() => { handlePrintPdf(); setIsExportMenuOpen(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    <div>
                      <div className="export-item-title">Print / Save as PDF</div>
                      <div className="export-item-desc">Document print rendering</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="canvas-header-divider" />

          {/* Explorer Sidebar Toggle */}
          <button 
            className={`canvas-icon-btn ${isSidebarOpen ? 'active-tool' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Hide File Explorer" : "Show File Explorer"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>

          {/* Fullscreen */}
          <button 
            className="canvas-icon-btn" 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Canvas"}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            )}
          </button>

          {/* Close */}
          <button className="canvas-icon-btn close-btn" onClick={onClose} title="Close Canvas">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>

      {/* Main Stage (VS Code Layout: Left Explorer Sidebar + Right Editor/Preview) */}
      <div className="canvas-main-stage">
        {/* VS Code Explorer Sidebar */}
        {isSidebarOpen && (
          <aside className="vscode-sidebar">
            <div className="vscode-sidebar-header">
              <span className="vscode-sidebar-title">EXPLORER</span>
              <div className="vscode-sidebar-actions">
                <button 
                  type="button" 
                  className="vscode-action-btn"
                  onClick={() => setIsAddingFile(true)}
                  title="New File"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                </button>
                <button 
                  type="button" 
                  className="vscode-action-btn"
                  onClick={() => setIsSidebarOpen(false)}
                  title="Collapse Explorer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="11 17 6 12 11 7"></polyline>
                    <polyline points="18 17 13 12 18 7"></polyline>
                  </svg>
                </button>
              </div>
            </div>

            {/* Collapsible Project Folder */}
            <div className="vscode-section-header">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="vscode-chevron">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span className="vscode-section-title">PROJECT FILES</span>
              <span className="vscode-file-count">{files.length}</span>
            </div>

            {/* Vertical File Tree */}
            <div className="vscode-file-tree">
              {files.map(file => (
                <div
                  key={file.name}
                  className={`vscode-tree-item ${file.name === activeFileName ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFileName(file.name)
                    if (activeTab === 'preview' && !file.name.endsWith('.html')) {
                      setActiveTab('code')
                    }
                  }}
                  title={file.name}
                >
                  <span className="vscode-tree-icon">{getFileIcon(file.name)}</span>
                  <span className="vscode-tree-name">{file.name}</span>
                  {files.length > 1 && (
                    <button 
                      type="button"
                      className="vscode-tree-close-btn"
                      onClick={(e) => handleDeleteFile(file.name, e)}
                      title={`Delete ${file.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {/* Inline Add File form in Tree */}
              {isAddingFile ? (
                <form className="vscode-tree-add-form" onSubmit={handleAddNewFile}>
                  <span className="vscode-tree-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </span>
                  <input
                    type="text"
                    autoFocus
                    placeholder="filename.css / app.js"
                    className="vscode-tree-input"
                    value={newFileNameInput}
                    onChange={(e) => setNewFileNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAddingFile(false)
                        setNewFileNameInput('')
                      }
                    }}
                  />
                  <button type="submit" className="vscode-inline-submit" title="Add">✓</button>
                  <button 
                    type="button" 
                    className="vscode-inline-cancel" 
                    onClick={() => { setIsAddingFile(false); setNewFileNameInput('') }}
                    title="Cancel"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <button 
                  type="button"
                  className="vscode-add-file-btn"
                  onClick={() => setIsAddingFile(true)}
                  title="Add new file"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>New File...</span>
                </button>
              )}
            </div>
          </aside>
        )}

        {/* Right Stage: Editor / Preview Pane */}
        <div className="canvas-content-pane">
          {/* Collapsed Sidebar Restore Tab */}
          {!isSidebarOpen && (
            <button 
              type="button"
              className="vscode-uncollapse-btn"
              onClick={() => setIsSidebarOpen(true)}
              title="Open Explorer Sidebar"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="13 17 18 12 13 7"></polyline>
                <polyline points="6 17 11 12 6 7"></polyline>
              </svg>
              <span>Explorer</span>
            </button>
          )}

          {/* VS Code Editor Open Tabs Bar */}
          <div className="vscode-editor-tabs-bar">
            <div className="vscode-open-tabs">
              {files.map(file => (
                <div
                  key={`tab-${file.name}`}
                  className={`vscode-editor-tab ${file.name === activeFileName ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFileName(file.name)
                    if (activeTab === 'preview' && !file.name.endsWith('.html')) {
                      setActiveTab('code')
                    }
                  }}
                  title={file.name}
                >
                  <span className="vscode-tab-icon">{getFileIcon(file.name)}</span>
                  <span className="vscode-tab-title">{file.name}</span>
                  {files.length > 1 && (
                    <span 
                      className="vscode-tab-close"
                      onClick={(e) => handleDeleteFile(file.name, e)}
                      title={`Close ${file.name}`}
                    >
                      ×
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Breadcrumb Path like VS Code */}
            <div className="vscode-breadcrumb">
              <span>src</span>
              <span className="bc-sep">›</span>
              <span>{activeFile.name}</span>
            </div>
          </div>

          {/* Body Content */}
          <div className="canvas-inner-body">
            {activeTab === 'preview' && isPreviewable ? (
              <div className="canvas-preview-wrapper">
                {/* 1. Multi-File Bundled HTML Sandboxed Frame */}
                {isHtmlCapable && (
                  <div className={`iframe-container view-${deviceView}`}>
                    <iframe
                      ref={iframeRef}
                      title={artifact.title}
                      srcDoc={getHtmlSrcDoc()}
                      sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                      allow="autoplay; speech-synthesis; fullscreen"
                      className="preview-iframe"
                    />
                  </div>
                )}

                {/* 2. SVG Vector Graphic Render */}
                {!isHtmlCapable && artifact.type === 'svg' && (
                  <div className="svg-preview-container">
                    <div 
                      className="svg-render-box"
                      dangerouslySetInnerHTML={{ __html: activeFile.content }} 
                    />
                  </div>
                )}

                {/* 3. Mermaid Architecture Diagram Render */}
                {!isHtmlCapable && artifact.type === 'mermaid' && (
                  <div className="mermaid-preview-container">
                    {mermaidError ? (
                      <div className="mermaid-error-banner">
                        <strong>Diagram Render Warning:</strong> {mermaidError}
                        <pre>{activeFile.content}</pre>
                      </div>
                    ) : (
                      <div 
                        className="mermaid-render-box"
                        dangerouslySetInnerHTML={{ __html: mermaidSvg || '<div class="loading-diagram">Rendering Diagram...</div>' }} 
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Multi-File Code View & Interactive Editor */
              <div className="canvas-code-wrapper">
                <div className="code-editor-line-numbers" ref={lineNumbersRef}>
                  {activeFile.content.split('\n').map((_, idx) => (
                    <span key={idx} className="line-num">{idx + 1}</span>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  className="code-editor-textarea"
                  value={activeFile.content}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onScroll={handleTextareaScroll}
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Voice Listening Pill */}
      {isListening && (
        <div className="canvas-voice-listening-banner">
          <div className="voice-listening-pulse">
            <span className="pulse-circle"></span>
            <span className="pulse-circle-2"></span>
          </div>
          <span className="voice-listening-text">{voiceNotification || `Listening (${speechLang})... Speak your edit commands`}</span>
          <button 
            type="button" 
            className="voice-stop-btn"
            onClick={toggleSpeechRecognition}
            title="Stop Listening"
          >
            Done Speaking
          </button>
        </div>
      )}

      {/* Interactive Agent Iteration Prompt Bar with Voice & Multi-File Support */}
      <form className="canvas-iteration-bar" onSubmit={handleSendModification}>
        {/* Voice Dictation Mic Button */}
        <button
          type="button"
          className={`canvas-mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleSpeechRecognition}
          title={isListening ? "Stop listening" : `Modify page by speech (Lang: ${speechLang})`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
          {isListening && <span className="mic-ring-wave" />}
        </button>

        <input
          type="text"
          className="iteration-input"
          placeholder={isListening ? "Listening... Speak your modifications" : `Modify ${activeFile.name} or project (e.g. "Add styles.css", "Make dark neon")...`}
          value={instructionInput}
          onChange={(e) => setInstructionInput(e.target.value)}
        />

        <button 
          type="submit" 
          className={`iteration-send-btn ${instructionInput.trim() ? 'active' : ''}`}
          disabled={!instructionInput.trim()}
          title="Send modification instruction to Coding Agent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </form>

      {/* GitHub Push Modal */}
      {isGitHubModalOpen && (
        <div className="canvas-github-overlay" onClick={() => setIsGitHubModalOpen(false)}>
          <div className="canvas-github-modal" onClick={e => e.stopPropagation()}>
            <div className="github-modal-header">
              <div className="github-modal-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                <span>Push Project to GitHub</span>
              </div>
              <button 
                type="button" 
                className="github-modal-close" 
                onClick={() => setIsGitHubModalOpen(false)}
              >
                ×
              </button>
            </div>

            {gitHubPushResult ? (
              <div className={`github-result-card ${gitHubPushResult.success ? 'success' : 'error'}`}>
                <div className="result-icon">
                  {gitHubPushResult.success ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  )}
                </div>
                <div className="result-title">
                  {gitHubPushResult.success ? 'Pushed Successfully' : 'Push Failed'}
                </div>
                <p className="result-message">{gitHubPushResult.message}</p>
                {gitHubPushResult.url && (
                  <a 
                    href={gitHubPushResult.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="github-view-btn"
                  >
                    <span>Open on GitHub</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                )}
                <button 
                  type="button" 
                  className="github-secondary-btn" 
                  onClick={() => setGitHubPushResult(null)}
                >
                  Push Again
                </button>
              </div>
            ) : (
              <form onSubmit={handlePushToGitHub} className="github-form">
                {/* Mode toggle */}
                <div className="github-mode-tabs">
                  <button
                    type="button"
                    className={`github-mode-tab ${!isCreatingNewRepo ? 'active' : ''}`}
                    onClick={() => setIsCreatingNewRepo(false)}
                    disabled={gitHubRepos.length === 0}
                  >
                    Existing Repository
                  </button>
                  <button
                    type="button"
                    className={`github-mode-tab ${isCreatingNewRepo ? 'active' : ''}`}
                    onClick={() => setIsCreatingNewRepo(true)}
                  >
                    + Create New Repo
                  </button>
                </div>

                {isCreatingNewRepo ? (
                  <div className="form-group">
                    <label>Repository Name</label>
                    <input 
                      type="text" 
                      className="github-input" 
                      value={newRepoName}
                      onChange={e => setNewRepoName(e.target.value)}
                      placeholder="e.g. animated-landing-page"
                      required
                    />
                    <span className="field-hint">A new repository will be created under your GitHub account.</span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Select Repository</label>
                    {isLoadingRepos ? (
                      <div className="github-loading-text">Loading your repositories...</div>
                    ) : (
                      <select 
                        className="github-select"
                        value={selectedRepo}
                        onChange={e => setSelectedRepo(e.target.value)}
                      >
                        {gitHubRepos.map(r => (
                          <option key={r.full_name} value={r.full_name}>
                            {r.name} {r.private ? '(Private)' : '(Public)'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Commit Message</label>
                  <input 
                    type="text" 
                    className="github-input" 
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    placeholder="e.g. Build: initial implementation via Aisia Canvas"
                    required
                  />
                </div>

                <div className="github-files-preview">
                  <label>Files to Commit ({files.length}):</label>
                  <div className="github-chips-list">
                    {files.map(f => (
                      <span key={f.name} className="github-file-chip">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>{f.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="github-modal-footer">
                  <button 
                    type="button" 
                    className="github-cancel-btn" 
                    onClick={() => setIsGitHubModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="github-submit-btn" 
                    disabled={isPushingToGitHub}
                  >
                    {isPushingToGitHub ? 'Pushing to GitHub...' : 'Confirm & Push to GitHub'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

export default CodingCanvas
