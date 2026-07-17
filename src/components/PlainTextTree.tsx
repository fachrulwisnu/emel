import React from 'react';

interface PlainTextTreeProps {
  text: string;
}

export default function PlainTextTree({ text }: PlainTextTreeProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  
  let currentNormalLines: string[] = [];
  let currentQuotedLines: string[] = [];

  const flushNormal = (key: string | number) => {
    if (currentNormalLines.length > 0) {
      // Remove trailing blank lines but keep internal ones
      let linesToRender = [...currentNormalLines];
      while (linesToRender.length > 0 && linesToRender[linesToRender.length - 1].trim() === '') {
        linesToRender.pop();
      }
      if (linesToRender.length > 0) {
        result.push(
          <div 
            key={`norm-${key}`} 
            className="whitespace-pre-wrap select-text leading-relaxed text-slate-700 font-sans text-sm tracking-normal"
          >
            {linesToRender.join('\n')}
          </div>
        );
      }
      currentNormalLines = [];
    }
  };

  const flushQuoted = (key: string | number) => {
    if (currentQuotedLines.length > 0) {
      // Clean up leading/trailing empty lines inside quote
      let linesToRender = [...currentQuotedLines];
      while (linesToRender.length > 0 && linesToRender[0].trim() === '') {
        linesToRender.shift();
      }
      while (linesToRender.length > 0 && linesToRender[linesToRender.length - 1].trim() === '') {
        linesToRender.pop();
      }
      
      if (linesToRender.length > 0) {
        const cleanQuoteText = linesToRender.join('\n');
        result.push(
          <details 
            key={`quote-${key}`} 
            className="group mt-3 border border-slate-200/60 rounded-xl overflow-hidden bg-slate-50/40 font-sans transition-all duration-200"
          >
            <summary className="px-4 py-2 bg-slate-100 hover:bg-slate-200/70 text-xs font-semibold text-slate-600 cursor-pointer list-none flex items-center justify-between transition-colors select-none">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💬</span>
                <span>Lihat Riwayat Percakapan Sebelumnya...</span>
              </div>
              <span className="transition-transform duration-200 group-open:rotate-180 text-slate-400 font-mono text-[10px]">▼</span>
            </summary>
            <div className="p-4 border-t border-slate-100 bg-white/50 text-slate-500 whitespace-pre-wrap text-xs leading-relaxed font-sans border-l-2 border-l-slate-300 ml-4 my-2 pl-3">
              {cleanQuoteText}
            </div>
          </details>
        );
      }
      currentQuotedLines = [];
    }
  };

  lines.forEach((line, index) => {
    // Regex matches optional whitespace, followed by ">", followed by optional space
    const isQuoted = /^\s*>/.test(line);

    if (isQuoted) {
      flushNormal(index);
      // Strip off the leading '>' and up to one whitespace character immediately following it
      const cleanLine = line.replace(/^\s*>\s?/, '');
      currentQuotedLines.push(cleanLine);
    } else {
      flushQuoted(index);
      currentNormalLines.push(line);
    }
  });

  flushNormal('end');
  flushQuoted('end');

  return (
    <div className="space-y-4 text-left">
      {result}
    </div>
  );
}
