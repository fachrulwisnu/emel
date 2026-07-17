import React from 'react';
import { Download, FileText, Image as ImageIcon, File } from 'lucide-react';

interface Attachment {
  filename: string;
  size: number;
  contentType: string;
  fileData?: string | null;
}

interface AttachmentGalleryProps {
  attachments: Attachment[];
}

export default function AttachmentGallery({ attachments }: AttachmentGalleryProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div id="attachment-gallery" className="mt-6 border-t border-slate-100 pt-6">
      <h4 className="text-xs font-semibold text-slate-500 mb-4 flex items-center gap-2">
        <span className="text-slate-400">📎</span> Lampiran ({attachments.length})
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {attachments.map((att, idx) => {
          const isImage = att.contentType?.startsWith('image/') && !!att.fileData;
          const isPdf = att.contentType?.includes('pdf');
          const hasData = !!att.fileData;
          const isTooLarge = att.size > 3 * 1024 * 1024; // 3MB limit
          const sizeKb = (att.size / 1024).toFixed(1);

          // Get file icon based on content type
          const getIcon = () => {
            if (isImage) return <ImageIcon className="h-6 w-6 text-blue-500" />;
            if (isPdf) return <FileText className="h-6 w-6 text-red-500" />;
            return <File className="h-6 w-6 text-slate-500" />;
          };

          const cardContent = (
            <div className="h-full flex flex-col bg-slate-50/50 border border-slate-200/60 rounded-xl overflow-hidden group hover:border-slate-300 hover:shadow-md transition-all duration-200">
              {/* Preview Area */}
              <div className="h-28 bg-slate-100 flex items-center justify-center overflow-hidden relative border-b border-slate-200/40">
                {isImage ? (
                  <img
                    src={`data:${att.contentType};base64,${att.fileData}`}
                    alt={att.filename}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {getIcon()}
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                      {att.contentType?.split('/')[1] || 'FILE'}
                    </span>
                  </div>
                )}

                {/* Hover download overlay */}
                {hasData && (
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                    <div className="p-2.5 bg-white/95 rounded-full shadow-lg text-slate-700 hover:scale-110 active:scale-95 transition-transform duration-150">
                      <Download className="h-5 w-5 text-slate-800" />
                    </div>
                  </div>
                )}
              </div>

              {/* Detail Info Footer */}
              <div className="p-3 flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors" title={att.filename}>
                  {att.filename || 'Lampiran'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                  <span>{sizeKb} KB</span>
                  {!hasData && (
                    <span className="text-[9px] bg-slate-200/70 text-slate-500 font-sans px-1.5 py-0.5 rounded-full font-medium">
                      No Download
                    </span>
                  )}
                </span>
              </div>
            </div>
          );

          if (hasData) {
            return (
              <a
                key={idx}
                href={`data:${att.contentType || 'application/octet-stream'};base64,${att.fileData}`}
                download={att.filename || 'Attachment'}
                title="Klik untuk mengunduh lampiran"
                className="block h-full cursor-pointer"
              >
                {cardContent}
              </a>
            );
          } else {
            return (
              <div
                key={idx}
                className="h-full cursor-not-allowed opacity-75"
                title={isTooLarge ? "File terlalu besar untuk di-download langsung." : "Lampiran tidak memiliki data Base64."}
              >
                {cardContent}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}
