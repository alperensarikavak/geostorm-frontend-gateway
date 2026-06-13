import React from "react";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Split content into paragraphs or blocks by double newline
  const blocks = normalized.split(/\n\n+/);

  const parseInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Regex matches bold (**bold**) and inline code (`code`)
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    const tokens = text.split(regex);

    tokens.forEach((token, index) => {
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={index} className="font-bold text-cyan-300">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code key={index} className="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-xs text-pink-400 border border-slate-800">
            {token.slice(1, -1)}
          </code>
        );
      } else {
        parts.push(token);
      }
    });

    return parts;
  };

  return (
    <div className="space-y-3.5 text-slate-300 text-sm leading-relaxed">
      {blocks.map((block, blockIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Headers: e.g. ### Header
        const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
          const level = headerMatch[1].length;
          const text = headerMatch[2];
          
          let headerClass = "font-semibold ";
          if (level === 1) {
            headerClass += "text-2xl text-slate-50 border-b border-slate-800 pb-2 mb-4 mt-6";
          } else if (level === 2) {
            headerClass += "text-xl text-slate-100 border-b border-slate-800 pb-1.5 mb-3 mt-5";
          } else if (level === 3) {
            headerClass += "text-base text-cyan-200 mt-4 mb-2";
          } else {
            headerClass += "text-sm text-slate-200 uppercase tracking-wider mt-3 mb-1.5";
          }

          return React.createElement(
            `h${level}`,
            { key: blockIdx, className: headerClass },
            parseInline(text)
          );
        }

        // Bullet lists
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          // Parse lines that start with list item markers
          const lines = trimmed.split("\n");
          return (
            <ul key={blockIdx} className="list-disc pl-5 space-y-1.5 mt-2 mb-4">
              {lines.map((line, lineIdx) => {
                const itemText = line.replace(/^[*+-]\s+/, "");
                return (
                  <li key={lineIdx} className="text-slate-300 leading-6">
                    {parseInline(itemText)}
                  </li>
                );
              })}
            </ul>
          );
        }

        // Paragraph block
        const lines = trimmed.split("\n");
        return (
          <p key={blockIdx} className="break-words">
            {lines.map((line, lineIdx) => (
              <React.Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {parseInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
