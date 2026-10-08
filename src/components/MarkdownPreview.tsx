import React, { useState } from "react";
import { parseMarkdown, type MarkdownBlock } from "../lib/markdown";

interface MarkdownPreviewProps {
  content: string;
  onWikiLinkClick?: (target: string) => void;
  onToggleTaskItem?: (lineIndex: number, checked: boolean) => void;
  className?: string;
}

export function MarkdownPreview({
  content,
  onWikiLinkClick,
  onToggleTaskItem,
  className = "",
}: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="preview-empty">还没有内容，开始写下第一行吧。</div>;
  }

  const blocks = parseMarkdown(content);

  return (
    <div className={`markdown-preview ${className}`}>
      {blocks.map((block, index) => (
        <BlockRenderer
          key={index}
          block={block}
          onWikiLinkClick={onWikiLinkClick}
          onToggleTaskItem={onToggleTaskItem}
        />
      ))}
    </div>
  );
}

function BlockRenderer({
  block,
  onWikiLinkClick,
  onToggleTaskItem,
}: {
  block: MarkdownBlock;
  onWikiLinkClick?: (target: string) => void;
  onToggleTaskItem?: (lineIndex: number, checked: boolean) => void;
}) {
  switch (block.type) {
    case "heading": {
      const headingContent = renderInlineMarkdown(block.text, onWikiLinkClick);
      switch (block.level) {
        case 1:
          return <h2>{headingContent}</h2>;
        case 2:
          return <h3>{headingContent}</h3>;
        case 3:
          return <h4>{headingContent}</h4>;
        case 4:
          return <h5>{headingContent}</h5>;
        case 5:
        case 6:
          return <h6>{headingContent}</h6>;
      }
      break;
    }
    case "paragraph":
      return <p>{renderInlineMarkdown(block.text, onWikiLinkClick)}</p>;

    case "blockquote":
      return (
        <blockquote className="md-blockquote">
          {block.text.split("\n").map((line, i) => (
            <div key={i}>{renderInlineMarkdown(line, onWikiLinkClick)}</div>
          ))}
        </blockquote>
      );

    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;

    case "unordered-list":
      return (
        <ul className="md-ul">
          {block.items.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item, onWikiLinkClick)}</li>
          ))}
        </ul>
      );

    case "ordered-list":
      return (
        <ol start={block.start} className="md-ol">
          {block.items.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item, onWikiLinkClick)}</li>
          ))}
        </ol>
      );

    case "task-list":
      return (
        <ul className="md-task-list">
          {block.items.map((item, i) => (
            <li key={i} className={`md-task-item ${item.checked ? "is-done" : ""}`}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => {
                  if (onToggleTaskItem) {
                    onToggleTaskItem(item.lineIndex, e.target.checked);
                  }
                }}
                disabled={!onToggleTaskItem}
              />
              <span>{renderInlineMarkdown(item.text, onWikiLinkClick)}</span>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i}>{renderInlineMarkdown(h, onWikiLinkClick)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderInlineMarkdown(cell, onWikiLinkClick)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="md-hr" />;
  }
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span className="md-code-lang">{lang || "text"}</span>
        <button
          type="button"
          className="md-code-copy"
          onClick={handleCopy}
          title="复制代码"
        >
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function renderInlineMarkdown(
  text: string,
  onWikiLinkClick?: (target: string) => void
): React.ReactNode {
  if (!text) return null;

  // Pattern to match:
  // 1. `code`
  // 2. **bold** or __bold__
  // 3. *italic* or _italic_
  // 4. ~~strikethrough~~
  // 5. [[wikilink]]
  // 6. [title](url)
  const regex =
    /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|(?<!\*)\*[^*]+?\*(?!\*)|(?<!_)_[^_]+?_(?!_)|~~[^~]+?~~|\[\[[^\]]+?\]\]|\[[^\]]+?\]\([^)]+?\))/g;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let keyCount = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    lastIdx = regex.lastIndex;

    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={`code-${keyCount++}`} className="md-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      parts.push(
        <strong key={`b-${keyCount++}`}>
          {renderInlineMarkdown(token.slice(2, -2), onWikiLinkClick)}
        </strong>
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      parts.push(
        <em key={`i-${keyCount++}`}>
          {renderInlineMarkdown(token.slice(1, -1), onWikiLinkClick)}
        </em>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(
        <del key={`del-${keyCount++}`}>
          {renderInlineMarkdown(token.slice(2, -2), onWikiLinkClick)}
        </del>
      );
    } else if (token.startsWith("[[") && token.endsWith("]]")) {
      const target = token.slice(2, -2).trim();
      parts.push(
        <span
          key={`wiki-${keyCount++}`}
          className="md-wiki-link"
          role="button"
          tabIndex={0}
          title={`知识双链: ${target}`}
          onClick={() => onWikiLinkClick?.(target)}
        >
          [[{target}]]
        </span>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`a-${keyCount++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}
