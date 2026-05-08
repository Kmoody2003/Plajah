import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Trash2, Send } from 'lucide-react';

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
    }
  };

  return (
    <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
      {!audioBlob ? (
        <>
          <div className="flex-1 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500' : 'bg-white/20'}`} />
            <span className="text-xs font-mono text-white/60">
              {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')} / 0:30
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isRecording ? (
              <button onClick={startRecording} className="p-3 bg-red-500 rounded-full hover:bg-red-600 transition-all">
                <Mic size={20} className="text-white" />
              </button>
            ) : (
              <button onClick={stopRecording} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
                <Square size={20} className="text-white" />
              </button>
            )}
            <button onClick={onCancel} className="p-3 text-white/40 hover:text-white transition-all">
              <Trash2 size={20} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 flex items-center gap-3">
            <Play size={16} className="text-small-orange" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/60">Voice Note Ready</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAudioBlob(null)} className="p-3 text-white/40 hover:text-white transition-all">
              <Trash2 size={20} />
            </button>
            <button onClick={handleSend} className="p-3 bg-small-orange rounded-full hover:bg-small-orange/80 transition-all">
              <Send size={20} className="text-white" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default VoiceRecorder;
