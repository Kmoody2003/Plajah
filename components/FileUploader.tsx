import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, AlertCircle } from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';

interface FileUploaderProps {
  onUploadComplete?: (url: string) => void;
  onBulkUploadComplete?: (urls: string[]) => void;
  type: 'PHOTO' | 'VIDEO' | 'MUSIC' | 'BOOK';
  label?: string;
  className?: string;
  multiple?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onUploadComplete, onBulkUploadComplete, type, label, className, multiple }) => {
  const { uploadFile } = useUpload();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);
    try {
      if (multiple && onBulkUploadComplete) {
        const uploadPromises = Array.from(files).map(file => uploadFile(file, type));
        const urls = await Promise.all(uploadPromises);
        onBulkUploadComplete(urls);
      } else {
        const url = await uploadFile(files[0], type);
        onUploadComplete(url);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={className}>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple={multiple}
        accept={type === 'PHOTO' ? 'image/*' : type === 'VIDEO' ? 'video/*' : type === 'MUSIC' ? 'audio/*' : '*'}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : error ? (
          <AlertCircle size={14} className="text-red-500" />
        ) : (
          <UploadCloud size={14} />
        )}
        {isUploading ? 'Uploading...' : label || 'Upload File'}
      </button>
      {error && <p className="mt-1 text-[8px] text-red-500 uppercase font-bold">{error}</p>}
    </div>
  );
};

export default FileUploader;
