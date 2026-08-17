import React from 'react';
import { Banknote } from 'lucide-react';

interface PayItForwardButtonProps {
  className?: string;
  variant?: 'ICON' | 'FULL';
}

const PayItForwardButton: React.FC<PayItForwardButtonProps> = ({ className, variant = 'ICON' }) => {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('OPEN_PIF_MODAL'));
  };

  if (variant === 'FULL') {
    return (
      <button 
        onClick={handleClick}
        className={className || "inline-flex h-[42px] items-center justify-center gap-2 rounded-full bg-small-orange px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-small-orange/20 transition-all hover:scale-[1.02] active:scale-95"}
      >
        <Banknote size={16} fill="white" />
        Pay It Forward
      </button>
    );
  }

  return (
    <button 
      onClick={handleClick}
      className={className || "p-2 text-small-orange hover:text-white hover:bg-small-orange rounded-full transition-all group"}
      title="Pay It Forward"
    >
      <Banknote size={18} className="group-hover:fill-white" />
    </button>
  );
};

export default PayItForwardButton;
