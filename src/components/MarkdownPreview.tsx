interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const blocks = content.split(/\n{2,}/);
  if (!content.trim()) return <div className="preview-empty">还没有内容，开始写下第一行吧。</div>;
  return (
    <div className="markdown-preview">
      {blocks.map((block, index) => {
        const text = block.trim();
        if (!text) return null;
        if (text.startsWith("### ")) return <h4 key={index}>{text.slice(4)}</h4>;
        if (text.startsWith("## ")) return <h3 key={index}>{text.slice(3)}</h3>;
        if (text.startsWith("# ")) return <h2 key={index}>{text.slice(2)}</h2>;
        if (text.startsWith("> ")) return <blockquote key={index}>{text.slice(2)}</blockquote>;
        if (text.startsWith("- ") || text.startsWith("* ")) {
          return <ul key={index}>{text.split("\n").map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
        }
        if (text.startsWith("```")) return <pre key={index}><code>{text.replace(/^```[a-z]*\n?/, "").replace(/```$/, "")}</code></pre>;
        return <p key={index}>{text}</p>;
      })}
    </div>
  );
}
