"use client"

// Lightweight markdown renderer — no external library needed for our use case.
// Handles headings, bold, lists, horizontal rules, and paragraphs.
// If requirements grow, swap this for react-markdown.

export default function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-slate-800 mt-5 mb-2">{parseInline(line.slice(4))}</h3>)
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-slate-900 mt-7 mb-3 pb-2 border-b border-slate-100">{parseInline(line.slice(3))}</h2>)
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold text-slate-900 mb-4">{parseInline(line.slice(2))}</h1>)
    } else if (line.startsWith("---") || line.startsWith("***")) {
      elements.push(<hr key={i} className="my-4 border-slate-200" />)
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Collect consecutive list items
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1 mb-3 text-sm text-slate-700">
          {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
        </ul>
      )
      continue
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1 mb-3 text-sm text-slate-700">
          {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
        </ol>
      )
      continue
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm text-slate-700 leading-relaxed mb-1">{parseInline(line)}</p>)
    }

    i++
  }

  return <div className="prose max-w-none">{elements}</div>
}

// Parse inline markdown: **bold**, *italic*, `code`
function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}
