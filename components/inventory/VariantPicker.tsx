import React from 'react';
import type { StoreProduct, StoreProductVariant } from '../../types';
import { liveVariants, unitPriceCents, isTracked } from '../../services/inventoryCore';
import Sheet from './Sheet';

/**
 * "Which one?" — picks a size/color for a product that has options. Shared by the register, the kiosk
 * and anywhere else a variant must be chosen before it can go on a ticket. Stock is the LIVE per-option
 * count; sold-out options are disabled for shoppers but sellable at the register (`allowSoldOut`) because
 * a cashier holding the item shouldn't be blocked by a wrong count — the sale flags it for a recount.
 */
const VariantPicker: React.FC<{
  product: StoreProduct;
  allowSoldOut?: boolean;
  onPick: (variant: StoreProductVariant) => void;
  onClose: () => void;
}> = ({ product, allowSoldOut, onPick, onClose }) => {
  const tracked = isTracked(product) && !product.allowBackorder;
  return (
    <Sheet title={product.title} eyebrow="Choose an option" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {liveVariants(product).map(v => {
          const out = tracked && v.stock <= 0;
          const disabled = out && !allowSoldOut;
          return (
            <button key={v.id} type="button" disabled={disabled} onClick={() => { onPick(v); onClose(); }}
              className="text-left rounded-2xl p-3 transition-transform active:scale-[0.98] disabled:cursor-not-allowed"
              style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)', opacity: disabled ? 0.4 : 1 }}>
              <span className="type-label-lg font-bold block truncate" style={{ color: 'var(--text-primary)' }}>{v.name}</span>
              <span className="type-body-sm block" style={{ color: 'var(--on-surface-variant)' }}>
                ${(unitPriceCents(product, v.id) / 100).toFixed(2)}
              </span>
              {tracked && (
                <span className="type-body-sm block font-semibold" style={{ color: out ? 'var(--pj-danger)' : v.stock <= 5 ? 'var(--pj-warning)' : 'var(--on-surface-variant)' }}>
                  {out ? (allowSoldOut ? '0 — sell anyway' : 'Sold out') : `${v.stock} left`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
};

export default VariantPicker;
