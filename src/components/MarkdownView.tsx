import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Render de Markdown con estilos acordes al diseño (sin plugin de typography):
// mapeamos cada elemento a clases de Tailwind + tokens de tema. Se usa para la
// guía del destino (texto importado de Wikivoyage/Wikipedia, editable en Markdown).
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground/90">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="font-serif text-base font-medium text-foreground mt-4 mb-1 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="font-serif text-base font-medium text-foreground mt-4 mb-1 first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="font-medium text-sm text-foreground mt-3 mb-1">{children}</h4>,
          h4: ({ children }) => <h4 className="font-medium text-sm text-foreground mt-3 mb-1">{children}</h4>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 marker:text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-primary">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{children}</a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
          ),
          code: ({ children }) => <code className="px-1 py-0.5 rounded bg-secondary text-foreground text-[0.8em]">{children}</code>,
          hr: () => <hr className="my-4 border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3"><table className="text-sm border-collapse">{children}</table></div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-medium bg-secondary">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
