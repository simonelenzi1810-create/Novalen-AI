import { memo, useState, type ReactNode, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copyText } from '../lib/clipboard';
import { Check, Copy } from 'lucide-react';
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const language = isValidElement<{ className?: string }>(children) ? children.props.className?.replace('language-', '') || 'codice' : 'codice';
  return <div className="code-block"><div className="code-heading"><span>{language}</span><button onClick={async () => {
    try { await copyText(textOf(children).replace(/\n$/, '')); setCopied(true); setFailed(false); setTimeout(() => setCopied(false), 2000); }
    catch { setFailed(true); }
  }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {failed ? 'Seleziona e copia' : copied ? 'Copiato' : 'Copia'}</button></div><pre>{children}</pre></div>;
}
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    pre: CodeBlock,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="image-placeholder">[Immagine esterna: {alt || 'immagine'}]</span>,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  }}>{content}</ReactMarkdown></div>;
});
