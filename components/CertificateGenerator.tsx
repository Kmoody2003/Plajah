import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Download, GraduationCap, Check, Star, Award } from 'lucide-react';
import { fetchClassrooms, auth, fetchUserProfile } from '../services/backendService';
import type { Classroom, UserProfile } from '../types';

// ── Certificate canvas renderer ───────────────────────────────────────────────

function drawCertificate(
  canvas: HTMLCanvasElement,
  opts: {
    studentName: string;
    courseTitle: string;
    instructorName: string;
    completionDate: string;
    accentColor: string;
  }
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = opts.accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Inner border
  ctx.strokeStyle = `${opts.accentColor}50`;
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, W - 64, H - 64);

  // Decorative corner accents
  const accent = (x: number, y: number, rx: number, ry: number) => {
    ctx.fillStyle = `${opts.accentColor}18`;
    ctx.beginPath();
    ctx.arc(x, y, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${opts.accentColor}30`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  accent(70, 70, 0, 0);
  accent(W - 70, 70, 0, 0);
  accent(70, H - 70, 0, 0);
  accent(W - 70, H - 70, 0, 0);

  // "CERTIFICATE OF COMPLETION" header
  ctx.fillStyle = `${opts.accentColor}60`;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '8px';
  ctx.fillText('CERTIFICATE OF COMPLETION', W / 2, 110);

  // Decorative line under header
  ctx.strokeStyle = opts.accentColor;
  ctx.lineWidth = 1.5;
  const lineW = 320;
  ctx.beginPath();
  ctx.moveTo(W / 2 - lineW / 2, 125);
  ctx.lineTo(W / 2 + lineW / 2, 125);
  ctx.stroke();

  // "This certifies that"
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('This certifies that', W / 2, 185);

  // Student name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText(opts.studentName, W / 2, 260);

  // Underline
  ctx.strokeStyle = `${opts.accentColor}80`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 220, 278);
  ctx.lineTo(W / 2 + 220, 278);
  ctx.stroke();

  // "has successfully completed"
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('has successfully completed the course', W / 2, 325);

  // Course title
  ctx.fillStyle = opts.accentColor;
  ctx.font = 'bold 34px Arial';
  ctx.fillText(opts.courseTitle, W / 2, 390);

  // Plajah platform badge
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('on PLAJAH PLATFORM', W / 2, 425);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 200, 455);
  ctx.lineTo(W / 2 + 200, 455);
  ctx.stroke();

  // Instructor signature line
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '16px Arial';
  ctx.fillText(opts.instructorName, W / 2 - 100, 500);
  ctx.fillText(opts.completionDate, W / 2 + 100, 500);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - 200, 510); ctx.lineTo(W / 2, 510); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, 510); ctx.lineTo(W / 2 + 200, 510); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '11px Arial';
  ctx.fillText('Instructor', W / 2 - 100, 526);
  ctx.fillText('Date', W / 2 + 100, 526);

  // Seal circle
  const sealX = W / 2, sealY = H - 80;
  ctx.strokeStyle = opts.accentColor;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sealX, sealY, 38, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(sealX, sealY, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = opts.accentColor;
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('✦', sealX, sealY + 10);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CertificateGenerator() {
  const canvasRef                   = useRef<HTMLCanvasElement>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [loading, setLoading]       = useState(true);
  const [generated, setGenerated]   = useState(false);
  const [accentColor, setAccentColor] = useState('#FF8C00');

  useEffect(() => {
    if (!auth.currentUser) return;
    Promise.all([
      fetchClassrooms(),
      fetchUserProfile(auth.currentUser.uid),
    ]).then(([classes, prof]) => {
      // Show classes user is enrolled in
      setClassrooms(classes.filter((c: Classroom) =>
        auth.currentUser && c.enrolledStudents.includes(auth.currentUser.uid)
      ));
      setProfile(prof);
      if (classes.length > 0) setSelectedId(classes[0].id);
      setLoading(false);
    });
  }, []);

  const course = classrooms.find(c => c.id === selectedId);

  const handleGenerate = () => {
    if (!canvasRef.current || !course || !profile) return;
    drawCertificate(canvasRef.current, {
      studentName:    profile.displayName || 'Student',
      courseTitle:    course.title,
      instructorName: course.ownerName,
      completionDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      accentColor,
    });
    setGenerated(true);
  };

  const handleDownload = () => {
    if (!canvasRef.current || !course) return;
    const link = document.createElement('a');
    link.download = `${course.title.replace(/\s+/g, '_')}_certificate.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const ACCENT_PRESETS = ['#FF8C00', '#818cf8', '#22c55e', '#f472b6', '#f59e0b', '#38bdf8', '#a78bfa'];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Course<br />Certificates</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Generate and download completion certificates</p>
      </div>

      {classrooms.length === 0 && !loading ? (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <GraduationCap size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Not enrolled in any courses</p>
          <p className="text-[9px] text-white/12">Enroll in a course to generate your completion certificate</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2">Select Course</label>
              <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setGenerated(false); }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none">
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Accent Color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_PRESETS.map(c => (
                  <button key={c} onClick={() => { setAccentColor(c); setGenerated(false); }}
                    className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                    style={{ background: c, borderColor: accentColor === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>

            {course && profile && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Certificate Preview Data</p>
                {[
                  { label: 'Student', value: profile.displayName },
                  { label: 'Course',  value: course.title        },
                  { label: 'Instructor', value: course.ownerName },
                  { label: 'Date',    value: new Date().toLocaleDateString() },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-2">
                    <span className="text-[8px] text-white/20 uppercase tracking-widest w-20 flex-shrink-0">{r.label}</span>
                    <span className="text-[9px] text-white/50 font-black">{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleGenerate} disabled={!course || !profile}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-30"
                style={{ background: accentColor, color: '#000' }}>
                <Award size={12} /> Generate
              </button>
              {generated && (
                <button onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-white/8 text-white hover:bg-white/12 transition-all">
                  <Download size={12} /> Download PNG
                </button>
              )}
            </div>
          </div>

          {/* Canvas preview */}
          <div className="flex flex-col gap-3">
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Preview</label>
            <div className="w-full rounded-2xl overflow-hidden border border-white/8 bg-black">
              <canvas
                ref={canvasRef}
                width={800} height={560}
                className="w-full h-auto"
                style={{ display: 'block' }}
              />
              {!generated && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">Click Generate to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
