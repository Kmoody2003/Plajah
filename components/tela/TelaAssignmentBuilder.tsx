import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, CheckCircle2, CircleHelp, File, FileAudio, FileText, FileVideo,
  Hash, Image as ImageIcon, Link2, ListChecks, Paperclip, Shapes, Sparkles,
  TextCursorInput, TextQuote, ToggleLeft, Trash2, X,
} from 'lucide-react';
import type { TelaAssignmentAudienceRole, TelaField, TelaResponseType } from '../../types';
import {
  recommendAssignmentAssets, TELA_EXTERNAL_VIDEO_PROVIDERS,
  TELA_NATIVE_RECORDING_LIMIT_SECONDS, type TelaQuestionDraft,
} from '../../services/telaAssignmentEngine';

const RESPONSE_TYPES: { id: TelaResponseType; label: string; icon: React.ReactNode; detail: string }[] = [
  { id: 'SHORT_TEXT', label: 'Text', icon: <TextCursorInput size={15}/>, detail: 'One line or short phrase' },
  { id: 'LONG_TEXT', label: 'Long response', icon: <FileText size={15}/>, detail: 'Paragraphs and written reasoning' },
  { id: 'NUMBER', label: 'Number / math', icon: <Hash size={15}/>, detail: 'Local math checking + tolerance' },
  { id: 'MULTIPLE_CHOICE', label: 'Multiple choice', icon: <ListChecks size={15}/>, detail: 'Teacher-defined choices' },
  { id: 'TRUE_FALSE', label: 'True / false', icon: <ToggleLeft size={15}/>, detail: 'Two-choice response' },
  { id: 'ATTACHMENT', label: 'Attachment', icon: <Paperclip size={15}/>, detail: 'Document, image, or project file' },
  { id: 'AUDIO', label: 'Recorded audio', icon: <FileAudio size={15}/>, detail: `Native recording · ${TELA_NATIVE_RECORDING_LIMIT_SECONDS}s` },
  { id: 'VIDEO', label: 'Recorded video', icon: <FileVideo size={15}/>, detail: `Native recording · ${TELA_NATIVE_RECORDING_LIMIT_SECONDS}s` },
  { id: 'LINK', label: 'Link', icon: <Link2 size={15}/>, detail: 'Reelo or another evidence URL' },
];

export interface TelaAssignmentBuilderProps {
  prompt: string;
  sourceLabel?: string;
  source?: TelaQuestionDraft['source'];
  editingField?: TelaField | null;
  fields: TelaField[];
  previewRole: TelaAssignmentAudienceRole;
  layoutMatch?: { name: string; confidence: number } | null;
  onClose: () => void;
  onSaveQuestion: (draft: TelaQuestionDraft, existingFieldId?: string) => void;
  onCreateInstruction: (text: string) => void;
  onDeleteQuestion?: (fieldId: string) => void;
  onSelectField?: (fieldId: string) => void;
  onPreviewRoleChange: (role: TelaAssignmentAudienceRole) => void;
  onOpenAssets: () => void;
}

const inputStyle: React.CSSProperties = { width: '100%', height: 38, padding: '0 11px', borderRadius: 9, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', fontSize: 12, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 9.5, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.38)', marginBottom: 5 };

const TelaAssignmentBuilder: React.FC<TelaAssignmentBuilderProps> = props => {
  const editing = props.editingField?.interaction;
  const [prompt, setPrompt] = useState(props.prompt);
  const [responseType, setResponseType] = useState<TelaResponseType>(editing?.responseType || 'SHORT_TEXT');
  const [correctAnswer, setCorrectAnswer] = useState(editing?.correctAnswer || '');
  const [options, setOptions] = useState((editing?.options || []).join('\n'));
  const [hints, setHints] = useState((editing?.hints || []).join('\n'));
  const [standards, setStandards] = useState((editing?.standards || []).join(', '));
  const [rubricTarget, setRubricTarget] = useState(editing?.rubricTarget || '');
  const [points, setPoints] = useState(editing?.points || 1);
  const [tolerance, setTolerance] = useState(editing?.tolerance || 0);
  const [required, setRequired] = useState(editing?.required ?? true);
  const recommendations = useMemo(() => recommendAssignmentAssets(prompt), [prompt]);

  useEffect(() => {
    const next = props.editingField?.interaction;
    setPrompt(next?.prompt || props.prompt);
    setResponseType(next?.responseType || 'SHORT_TEXT');
    setCorrectAnswer(next?.correctAnswer || '');
    setOptions((next?.options || []).join('\n'));
    setHints((next?.hints || []).join('\n'));
    setStandards((next?.standards || []).join(', '));
    setRubricTarget(next?.rubricTarget || '');
    setPoints(next?.points || 1);
    setTolerance(next?.tolerance || 0);
    setRequired(next?.required ?? true);
  }, [props.editingField?.id, props.prompt]);

  const save = () => props.onSaveQuestion({
    prompt,
    responseType,
    required,
    points,
    correctAnswer: correctAnswer.trim() || undefined,
    tolerance,
    options: responseType === 'TRUE_FALSE' ? ['True', 'False'] : options.split('\n').map(value => value.trim()).filter(Boolean),
    hints: hints.split('\n').map(value => value.trim()).filter(Boolean),
    standards: standards.split(',').map(value => value.trim()).filter(Boolean),
    rubricTarget,
    source: editing?.source || props.source,
  }, props.editingField?.id);

  const manual = !correctAnswer.trim() || ['LONG_TEXT', 'ATTACHMENT', 'AUDIO', 'VIDEO', 'LINK'].includes(responseType);

  return (
    <div className="fixed inset-0 z-[430] flex items-center justify-center p-2 sm:p-5" style={{ background: 'rgba(5,3,9,.9)', backdropFilter: 'blur(12px)' }} onPointerDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div className="w-full max-w-[1240px] h-[min(900px,94vh)] overflow-hidden rounded-[22px] flex flex-col" style={{ background: 'linear-gradient(155deg,#191220,#0d0a12)', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 30px 100px rgba(0,0,0,.72)' }}>
        <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 h-16" style={{ borderBottom: '1px solid rgba(255,255,255,.09)' }}>
          <span className="grid place-items-center w-10 h-10 rounded-[12px] text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8A00)' }}><CircleHelp size={18}/></span>
          <div className="min-w-0"><div className="font-display italic text-white text-[1.1rem]">Tela Assignment Builder</div><div className="text-[.64rem] text-white/42 truncate">{props.sourceLabel || 'Interactive document'} · question data stays connected to the page layout</div></div>
          <div className="ml-auto hidden sm:flex items-center gap-1 rounded-[10px] p-1 bg-white/[.045]">
            {(['STUDENT','TEACHER','PARENT'] as TelaAssignmentAudienceRole[]).map(role => <button key={role} onClick={() => props.onPreviewRoleChange(role)} className="h-7 px-2.5 rounded-[7px] text-[9px] font-extrabold" style={{ color: props.previewRole === role ? '#fff' : 'rgba(255,255,255,.38)', background: props.previewRole === role ? 'rgba(107,0,153,.55)' : 'transparent' }}>{role}</button>)}
          </div>
          <button onClick={props.onClose} className="grid place-items-center w-9 h-9 rounded-[10px] text-white/55 bg-white/[.055]"><X size={16}/></button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_250px]">
          <aside className="hidden lg:flex flex-col min-h-0" style={{ borderRight: '1px solid rgba(255,255,255,.08)' }}>
            <div className="px-4 py-3 text-[9px] font-extrabold tracking-[.13em] uppercase text-white/35">Assignment map · {props.fields.length}</div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 pb-3">
              {props.fields.map((field, index) => <button key={field.id} onClick={() => props.onSelectField?.(field.id)} className="w-full flex items-start gap-2.5 p-2.5 mb-1 rounded-[10px] text-left" style={{ color: props.editingField?.id === field.id ? '#fff' : 'rgba(255,255,255,.62)', background: props.editingField?.id === field.id ? 'rgba(107,0,153,.22)' : 'rgba(255,255,255,.025)', border: props.editingField?.id === field.id ? '1px solid rgba(208,188,255,.25)' : '1px solid transparent' }}><span className="grid place-items-center w-5 h-5 rounded-full shrink-0 text-[9px] font-extrabold bg-white/[.07]">{index + 1}</span><span className="min-w-0"><b className="block text-[10.5px] truncate">{field.interaction?.prompt || field.name}</b><span className="text-[8.5px] text-white/35">{field.interaction?.responseType?.replace('_',' ') || field.type}</span></span></button>)}
              {!props.fields.length && <div className="p-4 rounded-[12px] text-[10.5px] leading-relaxed text-white/38 bg-white/[.025]">Highlight text in a Writer, or select a text object in Studio, then create the first question.</div>}
            </div>
            {props.layoutMatch && <div className="m-3 p-3 rounded-[12px]" style={{ background: 'rgba(0,218,243,.07)', border: '1px solid rgba(0,218,243,.2)' }}><div className="flex items-center gap-2 text-[10px] font-extrabold text-[#8FF5FF]"><Sparkles size={13}/> Learned layout match</div><div className="mt-1 text-[9px] text-white/45">{props.layoutMatch.name} · {Math.round(props.layoutMatch.confidence * 100)}% structure similarity</div></div>}
          </aside>

          <main className="min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
            <div className="max-w-[700px] mx-auto">
              <div className="flex items-center gap-2 mb-4"><span className="grid place-items-center w-7 h-7 rounded-[8px] text-white bg-[rgba(107,0,153,.4)]"><CircleHelp size={14}/></span><div><h2 className="text-white text-[.9rem] font-extrabold">{props.editingField ? 'Edit interactive question' : 'Turn selection into a question'}</h2><p className="text-[.61rem] text-white/36">Confirming automatically creates and positions its answer field.</p></div></div>
              <label><span style={labelStyle}>Question prompt</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} style={{ ...inputStyle, height: 78, paddingTop: 10, resize: 'vertical', lineHeight: 1.45 }}/></label>

              <div className="mt-5"><span style={labelStyle}>Student response</span><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{RESPONSE_TYPES.map(type => <button key={type.id} onClick={() => setResponseType(type.id)} className="min-h-[64px] p-2.5 rounded-[11px] text-left" style={{ background: responseType === type.id ? 'rgba(107,0,153,.28)' : 'rgba(255,255,255,.035)', border: responseType === type.id ? '1px solid rgba(208,188,255,.38)' : '1px solid rgba(255,255,255,.08)', color: responseType === type.id ? '#fff' : 'rgba(255,255,255,.62)' }}><span className="flex items-center gap-1.5 text-[10.5px] font-extrabold">{type.icon}{type.label}</span><span className="block mt-1 text-[8.5px] leading-tight text-white/32">{type.detail}</span></button>)}</div></div>

              {(responseType === 'MULTIPLE_CHOICE') && <label className="block mt-4"><span style={labelStyle}>Choices · one per line</span><textarea value={options} onChange={event => setOptions(event.target.value)} rows={4} placeholder={'Choice A\nChoice B\nChoice C'} style={{ ...inputStyle, height: 88, paddingTop: 8, resize: 'vertical' }}/></label>}
              {(responseType === 'VIDEO') && <div className="mt-4 p-3 rounded-[11px] text-[10px] leading-relaxed text-white/55" style={{ background: 'rgba(255,138,0,.07)', border: '1px solid rgba(255,138,0,.18)' }}><b className="text-[#FFC078]">One-minute native capture.</b> Longer work becomes a link from {TELA_EXTERNAL_VIDEO_PROVIDERS.join(', ')} or another teacher-approved host.</div>}

              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <label><span style={labelStyle}>Answer key <em style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>· optional</em></span><input value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} placeholder={manual ? 'Leave blank for teacher review' : 'Correct response'} style={inputStyle}/></label>
                <label><span style={labelStyle}>Points</span><input type="number" min={0} value={points} onChange={event => setPoints(Math.max(0, +event.target.value || 0))} style={inputStyle}/></label>
                {responseType === 'NUMBER' && <label><span style={labelStyle}>Numeric tolerance</span><input type="number" min={0} step="any" value={tolerance} onChange={event => setTolerance(Math.max(0, +event.target.value || 0))} style={inputStyle}/></label>}
                <label className="flex items-center gap-2 pt-5 text-[11px] font-bold text-white/62"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} className="accent-[#D40055]"/> Required response</label>
              </div>

              <label className="block mt-4"><span style={labelStyle}>Student tips · one progressive hint per line</span><textarea value={hints} onChange={event => setHints(event.target.value)} rows={3} placeholder="Point them toward a method or source—never paste the answer." style={{ ...inputStyle, height: 72, paddingTop: 8, resize: 'vertical' }}/></label>
              <div className="grid sm:grid-cols-2 gap-3 mt-4"><label><span style={labelStyle}>Standards</span><input value={standards} onChange={event => setStandards(event.target.value)} placeholder="CCSS.MATH.5.NF.A.1, …" style={inputStyle}/></label><label><span style={labelStyle}>Rubric target</span><input value={rubricTarget} onChange={event => setRubricTarget(event.target.value)} placeholder="Evidence and reasoning" style={inputStyle}/></label></div>

              <div className="mt-5 p-3.5 rounded-[13px] flex items-start gap-3" style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}><CheckCircle2 size={17} className="shrink-0 mt-0.5 text-[#00DAF3]"/><div className="text-[10.5px] leading-relaxed text-white/50"><b className="text-white/82">Role-safe grading:</b> students receive coaching tips; teachers and parents can see correctness, points, and the answer-key comparison. Open media and written responses remain queued for human review.</div></div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button onClick={save} disabled={!prompt.trim()} className="h-10 px-5 rounded-[11px] text-[11px] font-extrabold text-white disabled:opacity-35" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>{props.editingField ? 'Save question properties' : 'Confirm question + answer field'}</button>
                <button onClick={() => props.onCreateInstruction(prompt)} disabled={!prompt.trim()} className="h-10 px-4 rounded-[11px] text-[11px] font-extrabold text-white/72 bg-white/[.055] border border-white/[.1]"><TextQuote size={14} className="inline mr-1.5"/>Make instruction instead</button>
                {props.editingField && props.onDeleteQuestion && <button onClick={() => props.onDeleteQuestion?.(props.editingField!.id)} className="ml-auto h-10 px-3 rounded-[11px] text-[10px] font-extrabold text-[#FF8FA8] bg-[rgba(212,0,85,.08)]"><Trash2 size={13} className="inline mr-1"/>Remove interaction</button>}
              </div>
            </div>
          </main>

          <aside className="hidden lg:flex flex-col min-h-0 p-3" style={{ borderLeft: '1px solid rgba(255,255,255,.08)' }}>
            <div className="flex items-center gap-2 px-1 py-2 text-[9px] font-extrabold tracking-[.13em] uppercase text-white/35"><Shapes size={13}/> Assignment assets</div>
            <div className="space-y-2">{recommendations.map(item => <button key={item.kind} onClick={props.onOpenAssets} className="w-full p-3 rounded-[12px] text-left" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.075)' }}><span className="flex items-center gap-2 text-[10px] font-extrabold text-white/78">{item.kind === 'VECTOR' ? <Shapes size={14}/> : item.kind === 'PHOTO' ? <ImageIcon size={14}/> : item.kind === 'MODEL_3D' ? <Box size={14}/> : item.kind === 'VIDEO' ? <FileVideo size={14}/> : <FileAudio size={14}/>} {item.label}</span><span className="block mt-1 text-[8.5px] leading-relaxed text-white/34">{item.reason}</span></button>)}</div>
            <button onClick={props.onOpenAssets} className="mt-3 h-9 rounded-[10px] text-[10px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#00A8BC)' }}>Open asset library</button>
            <div className="mt-auto p-3 rounded-[12px] text-[9px] leading-relaxed text-white/38 bg-white/[.025]"><File size={13} className="inline mr-1"/> Photos, vector graphics, audio, video and model references remain independent assets—the assignment keeps the source relationship instead of flattening them into a screenshot.</div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TelaAssignmentBuilder;
