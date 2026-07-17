import React, { useMemo, useEffect, useRef } from 'react';

interface HtmlEmailViewerProps {
  htmlContent: string;
}

export default function HtmlEmailViewer({ htmlContent }: HtmlEmailViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const processedHtml = useMemo(() => {
    if (!htmlContent) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      // Find all blockquotes and elements with 'gmail_quote' class
      const quotes = Array.from(doc.querySelectorAll('blockquote, .gmail_quote'));

      quotes.forEach((quote, index) => {
        const element = quote as HTMLElement;
        // Hide the blockquote or quote block by default
        element.style.display = 'none';
        element.classList.add('gmail-quote-block');
        element.setAttribute('data-quote-index', index.toString());

        // Create the small Gmail-style [...] button
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'gmail-ellipsis-btn inline-flex items-center justify-center px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded font-semibold text-[10px] tracking-wider transition-all duration-150 border border-slate-200 outline-none my-1.5 select-none cursor-pointer';
        btn.innerText = '•••';
        btn.setAttribute('data-target-index', index.toString());
        btn.title = 'Tampilkan riwayat percakapan';

        // Insert the button before the quote element
        if (element.parentNode) {
          element.parentNode.insertBefore(btn, element);
        }
      });

      return doc.body.innerHTML;
    } catch (err) {
      console.error('[HtmlEmailViewer] Failed to parse HTML content:', err);
      return htmlContent;
    }
  }, [htmlContent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const buttons = container.querySelectorAll('.gmail-ellipsis-btn');
    const handlers: { btn: Element; handler: () => void }[] = [];

    buttons.forEach((btn) => {
      const targetIndex = btn.getAttribute('data-target-index');
      const quote = container.querySelector(`.gmail-quote-block[data-quote-index="${targetIndex}"]`) as HTMLElement;

      if (quote) {
        const handler = () => {
          const isHidden = quote.style.display === 'none';
          if (isHidden) {
            quote.style.display = 'block';
            btn.classList.add('bg-slate-200', 'text-slate-700');
            btn.innerHTML = '••• (Sembunyikan)';
          } else {
            quote.style.display = 'none';
            btn.classList.remove('bg-slate-200', 'text-slate-700');
            btn.innerHTML = '•••';
          }
        };
        btn.addEventListener('click', handler);
        handlers.push({ btn, handler });
      }
    });

    return () => {
      handlers.forEach(({ btn, handler }) => {
        btn.removeEventListener('click', handler);
      });
    };
  }, [processedHtml]);

  if (!htmlContent) return null;

  return (
    <div 
      ref={containerRef}
      className="html-email-content text-left text-slate-700 leading-relaxed font-sans text-sm select-text overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}
