import React, { useMemo } from 'react';

interface HtmlEmailViewerProps {
  htmlContent: string;
}

export default function HtmlEmailViewer({ htmlContent }: HtmlEmailViewerProps) {
  const processedHtml = useMemo(() => {
    if (!htmlContent) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      // Find all blockquotes and elements with 'gmail_quote' class
      const quotes = Array.from(doc.querySelectorAll('blockquote, .gmail_quote'));

      quotes.forEach((quote) => {
        // Only wrap it if it hasn't been wrapped yet
        if (quote.parentNode && quote.parentNode.nodeName !== 'DETAILS') {
          const details = doc.createElement('details');
          details.className = 'email-history-details mt-3 border border-slate-200/60 rounded-xl overflow-hidden bg-slate-50/40';

          const summary = doc.createElement('summary');
          summary.className = 'email-history-summary px-4 py-2.5 bg-slate-100 hover:bg-slate-200/70 text-xs font-semibold text-slate-600 cursor-pointer list-none flex items-center justify-between transition-colors select-none';
          
          summary.innerHTML = `
            <div class="flex items-center gap-1.5 font-sans">
              <span class="text-xs">💬</span>
              <span>Lihat Riwayat Percakapan Sebelumnya...</span>
            </div>
            <span class="summary-chevron text-slate-400 font-mono text-[10px] transition-transform duration-200">▼</span>
          `;

          // Replace quote in DOM tree
          quote.parentNode.insertBefore(details, quote);
          details.appendChild(summary);
          details.appendChild(quote);
        }
      });

      return doc.body.innerHTML;
    } catch (err) {
      console.error('[HtmlEmailViewer] Failed to parse HTML content:', err);
      return htmlContent;
    }
  }, [htmlContent]);

  if (!htmlContent) return null;

  return (
    <div 
      className="html-email-content text-left text-slate-700 leading-relaxed font-sans text-sm select-text overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}
