import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Printer, Shield, CheckCircle2, FileText, Download, Building2 } from 'lucide-react';
import type { Superbill } from '../../types/clinic';

interface SuperbillModalProps {
  superbill: Superbill;
  onClose: () => void;
}

export const SuperbillModal: React.FC<SuperbillModalProps> = ({ superbill, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#0b0514] border border-white/15 rounded-3xl max-w-2xl w-full p-6 text-white shadow-2xl space-y-6"
      >
        {/* Controls */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#00DAF3] uppercase tracking-wider block">
              Insurance Reimbursement Statement
            </span>
            <h3 className="text-xl font-black font-['Space_Grotesk'] text-white">
              Standard Clinical Superbill
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#00DAF3] text-black shadow-md shadow-[#00DAF3]/20 hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <Printer size={12} /> Print / Export PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Superbill Canvas */}
        <div
          ref={printRef}
          className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl space-y-6 text-xs font-sans print:p-0 print:shadow-none"
        >
          {/* Clinic & Provider Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 font-['Space_Grotesk']">
                Plajah Health & Wellness Clinic
              </h2>
              <p className="text-slate-600 text-[11px]">1247 Plajah Avenue, Suite 100, San Francisco, CA</p>
              <p className="text-slate-600 text-[11px]">Phone: (415) 555-0143 • Email: billing@plajahclinic.com</p>
            </div>
            <div className="text-right text-[11px] text-slate-600 font-mono space-y-0.5">
              <div><strong>NPI:</strong> {superbill.providerNpi || '1982736451'}</div>
              <div><strong>Tax ID / EIN:</strong> {superbill.clinicTaxId || '82-9481029'}</div>
              <div><strong>Date of Service:</strong> {superbill.dateOfService}</div>
            </div>
          </div>

          {/* Patient Details */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px]">
            <div>
              <span className="text-slate-500 font-mono block text-[9px] uppercase">Patient Name:</span>
              <strong className="text-slate-900 text-sm">{superbill.patientName}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-mono block text-[9px] uppercase">Rendering Provider:</span>
              <strong className="text-slate-900 text-sm">{superbill.providerName}</strong>
            </div>
          </div>

          {/* ICD-10 Diagnosis Table */}
          <div>
            <h4 className="font-bold text-slate-900 uppercase font-mono text-[10px] mb-1.5 tracking-wider">
              Diagnoses (ICD-10-CM Codes):
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 font-mono text-[9px] uppercase">
                  <tr>
                    <th className="p-2 border-b border-slate-200 w-24">ICD-10 Code</th>
                    <th className="p-2 border-b border-slate-200">Clinical Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {superbill.icd10Codes.map((d, i) => (
                    <tr key={i}>
                      <td className="p-2 font-mono font-bold text-slate-900">{d.code}</td>
                      <td className="p-2 text-slate-700">{d.desc}</td>
                    </tr>
                  ))}
                  {superbill.icd10Codes.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-2 text-slate-400 italic">No diagnostic codes attached</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CPT / CDT Procedures Table */}
          <div>
            <h4 className="font-bold text-slate-900 uppercase font-mono text-[10px] mb-1.5 tracking-wider">
              Itemized Procedures & Services (CPT / CDT):
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 font-mono text-[9px] uppercase">
                  <tr>
                    <th className="p-2 border-b border-slate-200 w-24">Code</th>
                    <th className="p-2 border-b border-slate-200">Description</th>
                    <th className="p-2 border-b border-slate-200 text-center w-12">Units</th>
                    <th className="p-2 border-b border-slate-200 text-right w-20">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {superbill.procedureCodes.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2 font-mono font-bold text-slate-900">{p.code}</td>
                      <td className="p-2 text-slate-700">{p.desc}</td>
                      <td className="p-2 text-center text-slate-700">{p.units}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">${p.fee.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Sign-off */}
          <div className="flex justify-between items-end pt-3 border-t border-slate-200">
            <div className="text-[10px] text-slate-500 max-w-xs space-y-1">
              <p>
                This statement may be submitted by the patient directly to their health or dental insurer for direct policy reimbursement.
              </p>
              <div className="pt-2 font-mono">
                Signature on File • {superbill.providerName}
              </div>
            </div>
            <div className="w-52 space-y-1 text-right text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Total Charges:</span>
                <span className="font-mono font-bold text-slate-900">${superbill.totalBilled.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Patient Paid:</span>
                <span className="font-mono text-emerald-700 font-bold">-${superbill.patientPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-300 font-bold text-slate-900 text-sm">
                <span>Balance Due:</span>
                <span className="font-mono">${superbill.balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SuperbillModal;
