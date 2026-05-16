import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';

interface FileUploaderProps {
  onUploadComplete?: (url: string) => void;
  onBulkUploadComplete?: (urls: string[]) => void;
  type: 'PHOTO' | 'VIDEO' | 'MUSIC' | 'BOOK';
  label?: string;
  className?: string;
  multiple?: boolean;
  /** When true renders the large hero-style upload button */
  hero?: boolean;
}

const ACCEPT: Record<FileUploaderProps['type'], string> = {
  PHOTO: 'image/*',
  VIDEO: 'video/*',
  MUSIC: 'audio/*,.iamf',
  BOOK: '.pdf,.epub,.txt',
};

const FileUploader: React.FC<FileUploaderProps> = ({
  onUploadComplete,
  onBulkUploadComplete,
  type,
  label,
  className,
  multiple,
  hero,
}) => {
  const { uploadFile } = useUpload();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setIsUploading(true);
    setError(null);
    setDone(false);
    try {
      if (multiple && onBulkUploadComplete) {
        const urls = await Promise.all(arr.map(f => uploadFile(f, type)));
        onBulkUploadComplete(urls);
      } else {
        const url = await uploadFile(arr[0], type);
        onUploadComplete?.(url);
      }
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [multiple, onBulkUploadComplete, onUploadComplete, type, uploadFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  if (hero) {
    return (
      <div className={className}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple={multiple}
          accept={ACCEPT[type]}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          disabled={isUploading}
          className={`
            group relative w-full flex flex-col items-center justify-center gap-4
            p-12 rounded-[2.5rem] border-2 border-dashed transition-all duration-300
            ${isDragging
              ? 'border-small-orange bg-small-orange/10 scale-[1.01]'
              : done
              ? 'border-green-500 bg-green-500/10'
              : 'border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]'}
            disabled:opacity-60 disabled:cursor-not-allowed
          `}
        >
          <div className={`
            p-5 rounded-[1.5rem] transition-all duration-300
            ${done ? 'bg-green-500/20' : 'bg-white/5 group-hover:bg-white/10'}
          `}>
            {isUploading
              ? <Loader2 size={32} className="animate-spin text-white/60" />
              : done
              ? <CheckCircle2 size={32} className="text-green-400" />
              : <UploadCloud size={32} className="text-white/60 group-hover:text-white transition-colors" />
            }
          </div>
          <div className="text-center">
            <p className="text-lg font-black uppercase tracking-tight text-white">
              {isUploading ? 'Uploading…' : done ? 'Upload complete' : label || 'Drop files here or click to browse'}
            </p>
            {!isUploading && !done && (
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 mt-1">
                {multiple ? 'Multiple files supported' : 'Single file'} · {ACCEPT[type]}
              </p>
            )}
          </div>
        </button>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-[10px] font-black uppercase tracking-widest">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple={multiple}
        accept={ACCEPT[type]}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={`
          flex items-center gap-2 px-5 py-2.5 rounded-xl
          text-[10px] font-black uppercase tracking-widest transition-all
          border
          ${done
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20'}
          disabled:opacity-50
        `}
      >
        {isUploading
          ? <Loader2 size={13} className="animate-spin" />
          : done
          ? <CheckCircle2 size={13} />
          : error
          ? <AlertCircle size={13} className="text-red-400" />
          : <UploadCloud size={13} />}
        {isUploading ? 'Uploading…' : done ? 'Done' : label || 'Upload'}
      </button>
      {error && <p className="mt-1 text-[8px] text-red-400 uppercase font-bold tracking-widest">{error}</p>}
    </div>
  );
};

export default FileUploader;
