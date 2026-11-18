import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Markdown con la tipografía del sistema de diseño (sin plugin de typography):
// cada elemento se mapea a clases con tokens. Lo usa la guía del destino, cuyo
// texto se importa de Wikivoyage/Wikipedia y se edita en Markdown.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-base leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h4 className="mt-6 mb-1.5 font-serif text-xl font-medium tracking-tight text-foreground first:mt-0">{children}</h4>,
          h2: ({ children }) => <h4 className="mt-6 mb-1.5 font-serif text-xl font-medium tracking-tight text-foreground first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-5 mb-1 text-base font-semibold text-foreground first:mt-0">{children}</h5>,
          h4: ({ children }) => <h5 className="mt-5 mb-1 text-base font-semibold text-foreground first:mt-0">{children}</h5>,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-primary">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent-foreground underline underline-offset-2 hover:opacity-80">{children}</a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-border-strong pl-3 italic text-muted-foreground">{children}</blockquote>
          ),
          code: ({ children }) => <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-sm text-foreground">{children}</code>,
          hr: () => <hr className="my-4 border-border" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto"><table className="border-collapse text-sm">{children}</table></div>
          ),
          th: ({ children }) => <th className="border border-border bg-secondary px-2.5 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2.5 py-1.5 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
