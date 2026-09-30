import type { Artifact, ProjectFile } from '../CodingCanvas'

/**
 * Helper to determine default filename based on language and index
 */
function getDefaultFilename(lang: string, index: number): string {
  const l = (lang || '').toLowerCase().trim()
  if (l === 'html' || l === 'htm') return index === 1 ? 'index.html' : `page-${index}.html`
  if (l === 'css') return index === 1 ? 'styles.css' : `styles-${index}.css`
  if (l === 'javascript' || l === 'js') return index === 1 ? 'app.js' : `script-${index}.js`
  if (l === 'typescript' || l === 'ts') return index === 1 ? 'app.ts' : `module-${index}.ts`
  if (l === 'python' || l === 'py') return index === 1 ? 'main.py' : `script-${index}.py`
  if (l === 'svg') return index === 1 ? 'graphic.svg' : `vector-${index}.svg`
  if (l === 'mermaid') return index === 1 ? 'diagram.mmd' : `flow-${index}.mmd`
  if (l === 'json') return index === 1 ? 'data.json' : `data-${index}.json`
  if (l === 'markdown' || l === 'md') return 'README.md'
  return `file-${index}.${l || 'txt'}`
}

/**
 * Extracts filename from code block attributes or initial comment headers
 */
function extractFilenameFromCode(code: string, rawLangLine: string): string | null {
  // 1. Check code fence attribute: ```html filename="index.html" or ```html index.html
  const fenceMatch = rawLangLine.match(/(?:filename=)?["']?([\w.\-/\\]+\.[a-zA-Z0-9]+)["']?/i)
  if (fenceMatch && fenceMatch[1] && !['html', 'css', 'js', 'javascript', 'typescript', 'ts', 'py', 'python', 'svg', 'json'].includes(fenceMatch[1].toLowerCase())) {
    return fenceMatch[1].trim()
  }

  // 2. Check first 3 lines of code for comments like <!-- filename: index.html --> or /* filename: styles.css */ or // filename: app.js
  const firstLines = code.split('\n').slice(0, 4).join('\n')
  const commentMatch = firstLines.match(/(?:<!--|\/\*|\/\/|#)\s*(?:filename|file):\s*([a-zA-Z0-9_\-./\\]+)(?:\s*-->|\*\/)?/i)
  if (commentMatch && commentMatch[1]) {
    return commentMatch[1].trim()
  }

  return null
}

/**
 * Parses markdown text to extract runnable code blocks and multi-file projects as Artifacts
 */
export function extractArtifactsFromText(text: string): Artifact[] {
  if (!text) return []

  const parsedFiles: ProjectFile[] = []
  // Matches ```language [extra]\n<code>```
  const codeBlockRegex = /```([a-zA-Z0-9_\-+ \t="'.]*)\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let index = 1

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const rawLangLine = (match[1] || '').trim()
    const firstWordLang = rawLangLine.split(/\s+/)[0]?.toLowerCase() || 'code'
    const code = match[2].trim()
    if (!code) continue

    const detectedFilename = extractFilenameFromCode(code, rawLangLine) || getDefaultFilename(firstWordLang, index)

    parsedFiles.push({
      name: detectedFilename,
      language: firstWordLang,
      content: code
    })
    index++
  }

  if (parsedFiles.length === 0) {
    return []
  }

  const artifacts: Artifact[] = []

  // Check if this constitutes a multi-file project (multiple files detected)
  if (parsedFiles.length > 1) {
    // Find primary HTML file or primary entry point
    const htmlFile = parsedFiles.find(f => f.name.endsWith('.html') || f.language === 'html')
    const primaryFile = htmlFile || parsedFiles[0]

    // Extract title from HTML title tag if available
    let projectTitle = 'Multi-File Web Project'
    if (htmlFile) {
      const titleMatch = htmlFile.content.match(/<title>(.*?)<\/title>/i)
      if (titleMatch && titleMatch[1].trim()) {
        projectTitle = titleMatch[1].trim()
      }
    }

    let projectType: Artifact['type'] = 'project'
    if (htmlFile || parsedFiles.some(f => f.language === 'html' || f.language === 'svg' || f.language === 'mermaid')) {
      projectType = 'html' // allows live preview rendering
    }

    // Deduplicate file names
    const uniqueFiles: ProjectFile[] = []
    const seenNames = new Set<string>()
    for (const file of parsedFiles) {
      let finalName = file.name
      let counter = 1
      while (seenNames.has(finalName)) {
        const parts = file.name.split('.')
        const ext = parts.length > 1 ? `.${parts.pop()}` : ''
        finalName = `${parts.join('.')}_${counter}${ext}`
        counter++
      }
      seenNames.add(finalName)
      uniqueFiles.push({ ...file, name: finalName })
    }

    // Add unified multi-file project artifact
    artifacts.push({
      id: `project-${Date.now()}`,
      title: projectTitle,
      language: 'project',
      code: primaryFile.content,
      type: projectType,
      files: uniqueFiles,
      activeFileName: primaryFile.name
    })
  } else {
    // Single file artifact
    const single = parsedFiles[0]
    let type: Artifact['type'] = 'code'
    let title = single.name

    if (single.language === 'html' || single.name.endsWith('.html')) {
      type = 'html'
      const titleMatch = single.content.match(/<title>(.*?)<\/title>/i)
      title = titleMatch ? titleMatch[1].trim() : 'Interactive Web App'
    } else if (single.language === 'svg' || single.name.endsWith('.svg')) {
      type = 'svg'
      title = 'Vector Graphic'
    } else if (single.language === 'mermaid' || single.name.endsWith('.mmd')) {
      type = 'mermaid'
      title = 'Architecture Diagram'
    } else if (single.language === 'javascript' || single.language === 'js' || single.name.endsWith('.js')) {
      type = 'javascript'
      title = single.name
    } else if (single.language === 'typescript' || single.language === 'ts' || single.name.endsWith('.ts')) {
      type = 'typescript'
      title = single.name
    } else if (single.language === 'python' || single.language === 'py' || single.name.endsWith('.py')) {
      type = 'python'
      title = single.name
    } else if (single.language === 'json' || single.name.endsWith('.json')) {
      type = 'json'
      title = single.name
    }

    artifacts.push({
      id: `artifact-${Date.now()}`,
      title,
      language: single.language,
      code: single.content,
      type,
      files: [single],
      activeFileName: single.name
    })
  }

  return artifacts
}
