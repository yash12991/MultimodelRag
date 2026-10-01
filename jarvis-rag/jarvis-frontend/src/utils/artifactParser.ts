import type { Artifact, ProjectFile } from '../CodingCanvas'

/**
 * Helper to determine default filename based on language and seen count
 */
function getDefaultFilename(lang: string, seenCounts: Record<string, number>): string {
  const l = (lang || '').toLowerCase().trim()
  const count = (seenCounts[l] || 0) + 1
  seenCounts[l] = count

  if (l === 'html' || l === 'htm') return count === 1 ? 'index.html' : `page-${count}.html`
  if (l === 'css' || l === 'scss' || l === 'sass' || l === 'less') return count === 1 ? 'styles.css' : `styles-${count}.css`
  if (l === 'javascript' || l === 'js' || l === 'jsx' || l === 'mjs') return count === 1 ? 'app.js' : `script-${count}.js`
  if (l === 'typescript' || l === 'ts' || l === 'tsx') return count === 1 ? 'app.ts' : `module-${count}.ts`
  if (l === 'python' || l === 'py') return count === 1 ? 'main.py' : `script-${count}.py`
  if (l === 'svg') return count === 1 ? 'graphic.svg' : `vector-${count}.svg`
  if (l === 'mermaid' || l === 'mmd') return count === 1 ? 'diagram.mmd' : `flow-${count}.mmd`
  if (l === 'json') return count === 1 ? 'data.json' : `data-${count}.json`
  if (l === 'markdown' || l === 'md') return 'README.md'
  return `file-${count}.${l || 'txt'}`
}

/**
 * Extracts filename from code block attributes, preceding text headers, or initial comment lines
 */
function extractFilenameFromCode(code: string, rawLangLine: string, precedingText: string = ''): string | null {
  // 1. Check code fence attribute: ```html filename="index.html" or ```html index.html or ```js app.js
  const fenceMatch = rawLangLine.match(/(?:filename=)?["']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)["']?/i)
  if (fenceMatch && fenceMatch[1]) {
    const candidate = fenceMatch[1].trim().replace(/^(\.\/|\/)/, '')
    const lower = candidate.toLowerCase()
    if (!['html', 'css', 'js', 'javascript', 'typescript', 'ts', 'py', 'python', 'svg', 'json', 'bash', 'sh'].includes(lower)) {
      return candidate
    }
  }

  // 2. Check preceding markdown lines (e.g. "### `index.html`", "**styles.css**", "File: script.js")
  if (precedingText) {
    const lastLines = precedingText.trim().split('\n').slice(-4).join('\n')
    const headerMatch = lastLines.match(/(?:###?|####|\*\*|__|\bfile(?:name)?:\s*|`)\s*([a-zA-Z0-9_\-./\\]+\.(?:html|css|js|jsx|ts|tsx|json|py|svg|md))(?:\s*[`*_])?/i)
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1].trim().replace(/^(\.\/|\/)/, '')
    }
  }

  // 3. Check first 5 lines of code for comments like <!-- filename: index.html --> or /* filename: styles.css */ or // filename: app.js
  const firstLines = code.split('\n').slice(0, 5).join('\n')
  const commentMatch = firstLines.match(/(?:<!--|\/\*|\/\/|#)\s*(?:filename|file)?:\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?:\s*-->|\*\/)?/i)
  if (commentMatch && commentMatch[1]) {
    return commentMatch[1].trim().replace(/^(\.\/|\/)/, '')
  }

  // 4. Check for direct comment line with filename like <!-- index.html --> or /* styles.css */ or // app.js
  const directCommentMatch = firstLines.match(/(?:<!--|\/\*|\/\/|#)\s*([a-zA-Z0-9_\-./\\]+\.(?:html|css|js|jsx|ts|tsx|json|py|svg|md))\s*(?:-->|\*\/)?/i)
  if (directCommentMatch && directCommentMatch[1]) {
    return directCommentMatch[1].trim().replace(/^(\.\/|\/)/, '')
  }

  return null
}

/**
 * Parses markdown text to extract runnable code blocks and multi-file projects as Artifacts
 */
export function extractArtifactsFromText(text: string): Artifact[] {
  if (!text) return []

  const parsedFiles: ProjectFile[] = []
  const seenLangs: Record<string, number> = {}

  // Matches ```language [extra]\n<code>```
  const codeBlockRegex = /```([a-zA-Z0-9_\-+ \t="'.]*)\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const rawLangLine = (match[1] || '').trim()
    const firstWordLang = rawLangLine.split(/\s+/)[0]?.toLowerCase() || 'code'
    const code = match[2].trim()
    if (!code) continue

    const precedingText = text.slice(Math.max(0, match.index - 250), match.index)
    const detectedFilename = extractFilenameFromCode(code, rawLangLine, precedingText) || getDefaultFilename(firstWordLang, seenLangs)

    parsedFiles.push({
      name: detectedFilename,
      language: firstWordLang,
      content: code
    })
  }

  if (parsedFiles.length === 0) {
    return []
  }

  const artifacts: Artifact[] = []

  // Check if this constitutes a multi-file project (multiple files detected)
  if (parsedFiles.length > 1) {
    // Find primary HTML file or primary entry point
    const htmlFile = parsedFiles.find(f => f.name === 'index.html') ||
                     parsedFiles.find(f => f.name.endsWith('.html') || f.language === 'html')
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
      while (seenNames.has(finalName.toLowerCase())) {
        const parts = file.name.split('.')
        const ext = parts.length > 1 ? `.${parts.pop()}` : ''
        finalName = `${parts.join('.')}_${counter}${ext}`
        counter++
      }
      seenNames.add(finalName.toLowerCase())
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
