// ClassworkHandoff — stands where the old Curriculum Studio / worksheet scanner used to be. Uploading,
// link extraction, scanning and turning documents into Tela worksheets all live in Tela Classwork now,
// which files everything to Content HQ; this card sends the teacher there, scoped to the class.
import React from 'react';
import { Sparkles } from 'lucide-react';
import { openTelaClasswork } from './edWork';

export default function ClassworkHandoff({ orgId, orgName, programId, programName, domain = 'CHRISTIAN_EDUCATION', canEdit = true }: {
  orgId: string;
  orgName: string;
  programId?: string;
  programName?: string;
  domain?: 'CHRISTIAN_EDUCATION' | 'ACADEMIA' | 'ORG_TRAINING';
  canEdit?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-purple-400/30 bg-purple-500/[0.07] p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px] space-y-1">
        <p className="text-sm font-black text-white">Worksheets and lessons are made in Tela Classwork</p>
        <p className="text-xs text-white/65 leading-relaxed">
          {canEdit
            ? 'Upload a PDF or Word file, paste a Google Doc or Form link, or scan a paper worksheet. Tela turns it into an interactive lesson, files the original in Content HQ, and sends it to the class.'
            : 'Your teacher posts lessons and worksheets from Tela Classwork. Open them from your class page.'}
        </p>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => openTelaClasswork({ orgId, orgName, programId, programName, domain })}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center gap-1.5"
        >
          <Sparkles size={13} /> Open Tela Classwork
        </button>
      )}
    </div>
  );
}
