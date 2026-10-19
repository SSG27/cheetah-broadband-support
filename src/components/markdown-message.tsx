import ReactMarkdown from "react-markdown";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
