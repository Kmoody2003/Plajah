import React, { useState, useEffect } from 'react';
import { createPrintOrder, estimatePrintCost } from '../services/luluPrintService';
import { Album } from '../types';
import { X, ShoppingCart, Loader2, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';

interface PrintOrderModalProps {
  book: Album;
  onClose: () => void;
}

const PrintOrderModal: React.FC<PrintOrderModalProps> = ({ book, onClose }) => {
  const [step, setStep] = useState(1);
  const [cost, setCost] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [shippingInfo, setShippingInfo] = useState({
    name: '',
    street1: '',
    city: '',
    state: '',
    country: 'US',
    postcode: '',
  });

  useEffect(() => {
    // Estimate cost on load
    estimatePrintCost(book.bookChapters?.length ? book.bookChapters.length * 10 : 200)
      .then(c => setCost(c));
  }, [book]);

  const handleOrder = async () => {
    setIsProcessing(true);
    try {
      const result = await createPrintOrder({
        title: book.title,
        author: book.artist,
        coverUrl: book.coverImage || 'https://example.com/cover.jpg',
        sourceFileUrl: book.customVideoUrl || 'https://example.com/content.pdf',
        quantity: 1,
        shippingAddress: shippingInfo
      });
      setOrderId((result as any).orderId);
      setStep(3); // Success
    } catch (e) {
      alert("Failed to place order.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-xl p-8 relative shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-white/50 hover:text-white">
          <X size={20} />
        </button>

        {step === 1 && (
          <div className="space-y-6">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                 <BookOpen size={24} className="text-white" />
               </div>
               <div>
                  <h2 className="text-2xl font-black uppercase tracking-widest leading-none">Print on Demand</h2>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">Powered by Lulu Print</p>
               </div>
             </div>

             <div className="flex gap-6 items-start bg-white/5 p-6 rounded-2xl border border-white/10">
               <img src={book.coverImage} className="w-24 h-32 object-cover rounded-md shadow-lg" alt="Cover" />
               <div className="space-y-2 flex-1">
                 <h3 className="font-bold text-lg leading-tight uppercase tracking-widest">{book.title}</h3>
                 <p className="text-white/40 text-xs uppercase tracking-widest">{book.artist}</p>
                 <div className="pt-4 flex justify-between items-center border-t border-white/10 mt-4">
                   <span className="text-xs font-bold uppercase tracking-widest text-white/40">Estimated Cost</span>
                   <span className="text-2xl font-black text-blue-500">${cost ? cost.toFixed(2) : '--.--'}</span>
                 </div>
               </div>
             </div>

             <button 
               onClick={() => setStep(2)}
               className="w-full py-4 bg-white text-black rounded-full font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all text-sm"
             >
               Continue to Shipping
             </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
              <h2 className="text-2xl font-black uppercase tracking-widest">Shipping Details</h2>
              <div className="space-y-4">
                <input 
                  type="text" placeholder="Full Name" 
                  value={shippingInfo.name} onChange={e => setShippingInfo({...shippingInfo, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                />
                <input 
                  type="text" placeholder="Street Address" 
                  value={shippingInfo.street1} onChange={e => setShippingInfo({...shippingInfo, street1: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" placeholder="City" 
                    value={shippingInfo.city} onChange={e => setShippingInfo({...shippingInfo, city: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                  />
                  <input 
                    type="text" placeholder="State/Province" 
                    value={shippingInfo.state} onChange={e => setShippingInfo({...shippingInfo, state: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" placeholder="Zip/Postal Code" 
                    value={shippingInfo.postcode} onChange={e => setShippingInfo({...shippingInfo, postcode: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                  />
                  <input 
                    type="text" placeholder="Country Code (e.g. US)" 
                    value={shippingInfo.country} onChange={e => setShippingInfo({...shippingInfo, country: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-bold placeholder:text-white/20 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setStep(1)}
                  className="px-6 py-4 rounded-full border border-white/10 font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                >
                  Back
                </button>
                <button 
                  onClick={handleOrder}
                  disabled={isProcessing || !shippingInfo.name || !shippingInfo.street1}
                  className="flex-1 bg-blue-500 text-white rounded-full py-4 font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><ShoppingCart size={16} /> Pay & Order P.O.D (${cost?.toFixed(2)})</>}
                </button>
              </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-12 space-y-6">
             <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(34,197,94,0.3)]">
               <BookOpen size={40} />
             </div>
             <h2 className="text-3xl font-black uppercase tracking-widest text-green-500">Order Placed!</h2>
             <p className="text-white/60 text-sm font-medium leading-relaxed">
               Your printed copy of <strong className="text-white">{book.title}</strong> is being prepared by our print-on-demand fulfillment center.
             </p>
             <div className="bg-white/5 p-4 rounded-xl font-mono text-xs text-white/50">
                Order ID: {orderId}
             </div>
             <button 
               onClick={onClose}
               className="w-full mt-8 py-4 bg-white/10 text-white rounded-full font-black uppercase tracking-widest hover:bg-white/20 transition-all text-sm"
             >
               Close
             </button>
          </div>
        )}

      </motion.div>
    </div>
  );
};

export default PrintOrderModal;
