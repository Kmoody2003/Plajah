import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, ChevronRight, ChevronLeft, Check, Loader2, Shirt,
  Tag, DollarSign, X, Image as ImageIcon, Sparkles, Globe, Link2,
  Zap, Package
} from 'lucide-react';
import {
  fetchPrintfulCatalog, fetchProductVariants, uploadDesignFile,
  generateMockups, createSyncProduct, suggestRetailPrice,
  type PrintfulProduct, type PrintfulVariant,
} from '../services/printfulService';
import {
  fetchGelatoCatalog, fetchGelatoVariants, fetchGelatoMockup,
  suggestGelatoRetailPrice,
  type GelatoProduct, type GelatoVariant,
} from '../services/gelatoService';
import { addMerchItem } from '../services/backendService';
import { MerchItem } from '../types';

interface MerchBuilderProps {
  artistId: string;
  onComplete: (item: MerchItem) => void;
  onClose: () => void;
}

// ── Fulfillment Partner Choice ─────────────────────────────────────────────────

type FulfillmentMode = 'printful' | 'gelato' | 'external';

const MODES: { id: FulfillmentMode; label: string; tagline: string; icon: React.ReactNode; badge?: string }[] = [
  {
    id: 'printful',
    label: 'Printful',
    tagline: 'Premium quality · White-label packaging · 180+ countries',
    icon: <Shirt size={22} className="text-small-orange" />,
    badge: 'Most Popular',
  },
  {
    id: 'gelato',
    label: 'Gelato',
    tagline: 'Fastest global delivery · Local printers in 32 countries · 200+ countries',
    icon: <Globe size={22} className="text-blue-400" />,
    badge: 'Best International',
  },
  {
    id: 'external',
    label: 'My Existing Store',
    tagline: 'Link Shopify, WooCommerce, Big Cartel, or any web store',
    icon: <Link2 size={22} className="text-purple-400" />,
  },
];

// ── Step types ─────────────────────────────────────────────────────────────────

type Step = 'choose-partner' | 'pick-product' | 'upload-design' | 'preview' | 'pricing' | 'external-link' | 'publishing';

const STEP_ORDER_POD: Step[] = ['choose-partner', 'pick-product', 'upload-design', 'preview', 'pricing', 'publishing'];
const STEP_ORDER_EXTERNAL: Step[] = ['choose-partner', 'external-link', 'publishing'];

const STEP_LABELS: Partial<Record<Step, string>> = {
  'choose-partner': 'Partner',
  'pick-product': 'Product',
  'upload-design': 'Design',
  'preview': 'Preview',
  'pricing': 'Pricing',
  'external-link': 'Link Store',
};

// ── Component ──────────────────────────────────────────────────────────────────

const MerchBuilder: React.FC<MerchBuilderProps> = ({ artistId, onComplete, onClose }) => {
  const [step, setStep] = useState<Step>('choose-partner');
  const [mode, setMode] = useState<FulfillmentMode>('printful');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Printful state
  const [pfProducts, setPfProducts] = useState<PrintfulProduct[]>([]);
  const [pfSelectedProduct, setPfSelectedProduct] = useState<PrintfulProduct | null>(null);
  const [pfVariants, setPfVariants] = useState<PrintfulVariant[]>([]);
  const [pfSelectedVariant, setPfSelectedVariant] = useState<PrintfulVariant | null>(null);

  // Gelato state
  const [glProducts, setGlProducts] = useState<GelatoProduct[]>([]);
  const [glSelectedProduct, setGlSelectedProduct] = useState<GelatoProduct | null>(null);
  const [glVariants, setGlVariants] = useState<GelatoVariant[]>([]);
  const [glSelectedVariant, setGlSelectedVariant] = useState<GelatoVariant | null>(null);

  // Shared design state
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pricing / details
  const [retailPrice, setRetailPrice] = useState<number>(0);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');

  // External store state
  const [externalStoreUrl, setExternalStoreUrl] = useState('');
  const [externalProductImageUrl, setExternalProductImageUrl] = useState('');
  const [externalPrice, setExternalPrice] = useState<number>(0);
  const [externalProductName, setExternalProductName] = useState('');
  const [externalDescription, setExternalDescription] = useState('');

  const stepOrder = mode === 'external' ? STEP_ORDER_EXTERNAL : STEP_ORDER_POD;
  const stepIndex = stepOrder.indexOf(step);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const goNext = () => {
    const next = stepOrder[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = stepOrder[stepIndex - 1];
    if (prev) setStep(prev);
  };

  // ── Load products ────────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'printful') {
        if (pfProducts.length === 0) {
          const catalog = await fetchPrintfulCatalog();
          setPfProducts(catalog);
        }
      } else if (mode === 'gelato') {
        if (glProducts.length === 0) {
          const catalog = await fetchGelatoCatalog();
          setGlProducts(catalog);
        }
      }
    } catch {
      setError('Failed to load products. Check your API key in .env');
    } finally {
      setLoading(false);
    }
  }, [mode, pfProducts.length, glProducts.length]);

  React.useEffect(() => {
    if (step === 'pick-product') loadProducts();
  }, [step, loadProducts]);

  // ── Select product ───────────────────────────────────────────────────────────

  const handleSelectPrintfulProduct = async (product: PrintfulProduct) => {
    setLoading(true);
    setPfSelectedProduct(product);
    try {
      const v = await fetchProductVariants(product.id);
      setPfVariants(v);
      setPfSelectedVariant(v[0] ?? null);
      if (v[0]) setRetailPrice(suggestRetailPrice(v[0].price));
    } catch { setError('Failed to load variants.'); }
    finally { setLoading(false); }
  };

  const handleSelectGelatoProduct = async (product: GelatoProduct) => {
    setLoading(true);
    setGlSelectedProduct(product);
    try {
      const v = await fetchGelatoVariants(product.productUid);
      setGlVariants(v);
      setGlSelectedVariant(v[0] ?? null);
      if (v[0]) setRetailPrice(suggestGelatoRetailPrice(v[0].price));
    } catch { setError('Failed to load variants.'); }
    finally { setLoading(false); }
  };

  // ── Design upload ────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDesignFile(file);
    setDesignPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setDesignFile(file);
    setDesignPreview(URL.createObjectURL(file));
  };

  const handleUploadAndPreview = async () => {
    if (!designFile) return;
    setLoading(true);
    setError(null);
    try {
      const url = await uploadDesignFile(designFile); // Printful upload; Gelato uses direct URL
      setDesignUrl(url);
      setStep('preview');

      if (mode === 'printful' && pfSelectedProduct && pfSelectedVariant) {
        const mockups = await generateMockups(pfSelectedProduct.id, [pfSelectedVariant.id], url);
        setMockupUrls(mockups);
      } else if (mode === 'gelato' && glSelectedProduct) {
        const mockup = await fetchGelatoMockup(glSelectedProduct.productUid, url);
        setMockupUrls(mockup ? [mockup] : []);
      }
    } catch (err: any) {
      setError(err.message ?? 'Upload failed.');
      setStep('upload-design');
    } finally {
      setLoading(false);
    }
  };

  // ── Publish (POD) ────────────────────────────────────────────────────────────

  const handlePublishPOD = async () => {
    if (!designUrl) return;
    setStep('publishing');
    setLoading(true);
    setError(null);
    try {
      let syncProductId: number | undefined;
      let thumbnailUrl = mockupUrls[0] ?? '';

      if (mode === 'printful' && pfSelectedProduct && pfSelectedVariant) {
        const result = await createSyncProduct({
          artistId,
          productName: productName || pfSelectedProduct.title,
          description,
          retailPrice,
          variantId: pfSelectedVariant.id,
          designUrl,
        });
        syncProductId = result.syncProductId;
        thumbnailUrl = result.thumbnailUrl || thumbnailUrl;
      }
      // Gelato: product creation happens at order time (no pre-sync needed)

      const newItem: Omit<MerchItem, 'id'> = {
        ownerId: artistId,
        title: productName || (mode === 'printful' ? pfSelectedProduct?.title : glSelectedProduct?.title) || 'Merch Item',
        description,
        price: retailPrice,
        imageUrl: thumbnailUrl,
        category: 'APPAREL',
        stock: 9999,
        timestamp: Date.now(),
        fulfillmentSource: mode,
        printfulSyncProductId: mode === 'printful' ? syncProductId : undefined,
        printfulVariantId: mode === 'printful' ? pfSelectedVariant?.id : undefined,
      };

      const id = await addMerchItem(newItem);
      onComplete({ ...newItem, id: id ?? `${mode}-${Date.now()}` });
    } catch (err: any) {
      setError(err.message ?? 'Publishing failed.');
      setStep('pricing');
    } finally {
      setLoading(false);
    }
  };

  // ── Publish (External) ───────────────────────────────────────────────────────

  const handlePublishExternal = async () => {
    if (!externalStoreUrl || !externalProductName) return;
    setStep('publishing');
    setLoading(true);
    setError(null);
    try {
      const newItem: Omit<MerchItem, 'id'> = {
        ownerId: artistId,
        title: externalProductName,
        description: externalDescription,
        price: externalPrice,
        imageUrl: externalProductImageUrl || 'https://picsum.photos/seed/ext/800/800',
        category: 'APPAREL',
        stock: 9999,
        timestamp: Date.now(),
        fulfillmentSource: 'external',
        externalStoreUrl,
      };
      const id = await addMerchItem(newItem);
      onComplete({ ...newItem, id: id ?? `ext-${Date.now()}` });
    } catch (err: any) {
      setError(err.message ?? 'Failed to link store.');
      setStep('external-link');
    } finally {
      setLoading(false);
    }
  };

  const selectedBaseCost = mode === 'printful'
    ? pfSelectedVariant?.price ?? '—'
    : mode === 'gelato' && glSelectedVariant
    ? `${(glSelectedVariant.price / 100).toFixed(2)}`
    : '—';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-3xl bg-[#0f0f0f] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-small-orange/10 rounded-2xl">
              <Sparkles size={18} className="text-small-orange" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Merch Builder</h2>
              <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                {mode === 'printful' ? 'Powered by Printful' : mode === 'gelato' ? 'Powered by Gelato' : 'External Store Link'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-0 px-8 py-5 border-b border-white/5 overflow-x-auto no-scrollbar">
          {stepOrder.filter(s => s !== 'publishing').map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 shrink-0 transition-all ${i <= stepIndex ? 'text-white' : 'text-white/20'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border transition-all ${
                  i < stepIndex ? 'bg-small-orange border-small-orange text-white' :
                  i === stepIndex ? 'border-small-orange text-small-orange' :
                  'border-white/10'
                }`}>
                  {i < stepIndex ? <Check size={10} /> : i + 1}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">{STEP_LABELS[s]}</span>
              </div>
              {i < stepOrder.filter(s => s !== 'publishing').length - 1 && (
                <div className={`flex-1 h-px mx-3 min-w-[16px] transition-all ${i < stepIndex ? 'bg-small-orange' : 'bg-white/10'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(90vh - 195px)' }}>
          <AnimatePresence mode="wait">

            {/* ── Step 1: Choose Partner ── */}
            {step === 'choose-partner' && (
              <motion.div key="choose" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-6">How do you want to fulfill orders?</h3>
                <div className="space-y-4">
                  {MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`w-full flex items-center gap-5 p-6 rounded-[1.5rem] border text-left transition-all ${
                        mode === m.id ? 'border-small-orange bg-small-orange/5' : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <div className={`p-3 rounded-xl shrink-0 ${mode === m.id ? 'bg-small-orange/10' : 'bg-white/5'}`}>
                        {m.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-black uppercase tracking-widest">{m.label}</span>
                          {m.badge && (
                            <span className="px-2 py-0.5 bg-small-orange/20 text-small-orange text-[8px] font-black uppercase tracking-widest rounded-full">
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/40 font-bold">{m.tagline}</p>
                      </div>
                      {mode === m.id && (
                        <div className="w-6 h-6 bg-small-orange rounded-full flex items-center justify-center shrink-0">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Partner comparison table */}
                <div className="mt-8 p-6 bg-white/[0.02] border border-white/5 rounded-[1.5rem]">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Quick comparison</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'Printful', quality: '★★★★★', speed: '★★★☆☆', countries: '180+', color: 'text-small-orange' },
                      { label: 'Gelato', quality: '★★★★☆', speed: '★★★★★', countries: '200+', color: 'text-blue-400' },
                      { label: 'Your Store', quality: 'Your own', speed: 'Your own', countries: 'Anywhere', color: 'text-purple-400' },
                    ].map(p => (
                      <div key={p.label} className="space-y-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${p.color}`}>{p.label}</p>
                        <p className="text-[8px] text-white/30">Quality: {p.quality}</p>
                        <p className="text-[8px] text-white/30">Speed: {p.speed}</p>
                        <p className="text-[8px] text-white/30">{p.countries} countries</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      if (mode === 'external') setStep('external-link');
                      else setStep('pick-product');
                    }}
                    className="px-8 py-4 bg-small-orange text-white rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
                  >
                    Continue <ChevronRight size={14} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2a: Pick Product (POD) ── */}
            {step === 'pick-product' && (
              <motion.div key="pick" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Choose a base product</h3>
                  <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${
                    mode === 'printful' ? 'bg-small-orange/20 text-small-orange' : 'bg-blue-400/20 text-blue-400'
                  }`}>{mode === 'printful' ? 'Printful' : 'Gelato'}</span>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-small-orange" />
                  </div>
                ) : error ? (
                  <div className="py-12 text-center text-red-400 text-sm font-bold">{error}</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {(mode === 'printful' ? pfProducts : glProducts).map((product: any) => {
                      const id = product.id ?? product.productUid;
                      const title = product.title;
                      const image = product.image ?? product.coverImageUrl;
                      const isSelected = mode === 'printful'
                        ? pfSelectedProduct?.id === id
                        : glSelectedProduct?.productUid === id;
                      return (
                        <button
                          key={id}
                          onClick={() => mode === 'printful' ? handleSelectPrintfulProduct(product) : handleSelectGelatoProduct(product)}
                          className={`relative p-4 rounded-[1.5rem] border transition-all text-left ${
                            isSelected ? 'border-small-orange bg-small-orange/10' : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-3 right-3 w-5 h-5 bg-small-orange rounded-full flex items-center justify-center">
                              <Check size={10} className="text-white" />
                            </div>
                          )}
                          <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-white/5">
                            <img src={image} alt={title} className="w-full h-full object-contain p-2" />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white line-clamp-2">{title}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 flex justify-between">
                  <button onClick={goBack} className="px-6 py-3 text-white/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <ChevronLeft size={14} /> Back
                  </button>
                  {(mode === 'printful' ? pfSelectedProduct : glSelectedProduct) && (
                    <button onClick={goNext} className="px-8 py-4 bg-small-orange text-white rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all">
                      Next <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 2b: External Store Link ── */}
            {step === 'external-link' && (
              <motion.div key="external" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-2">Link your existing store</h3>
                <p className="text-[10px] text-white/30 mb-8">Works with Shopify, WooCommerce, Big Cartel, Gumroad, or any web store. Customers click "Buy Now" and go directly to your store to complete purchase.</p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Product Name</label>
                    <input
                      type="text"
                      value={externalProductName}
                      onChange={e => setExternalProductName(e.target.value)}
                      placeholder="e.g. Vintage Logo Tee"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Store / Product URL</label>
                    <div className="relative">
                      <Link2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
                      <input
                        type="url"
                        value={externalStoreUrl}
                        onChange={e => setExternalStoreUrl(e.target.value)}
                        placeholder="https://your-store.com/products/tee"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-6 py-4 text-sm font-bold outline-none focus:border-purple-400/50 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Product Image URL <span className="text-white/20">(optional)</span></label>
                    <input
                      type="url"
                      value={externalProductImageUrl}
                      onChange={e => setExternalProductImageUrl(e.target.value)}
                      placeholder="https://your-store.com/image.jpg"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-white/30 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Display Price ($)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                          type="number"
                          value={externalPrice}
                          onChange={e => setExternalPrice(parseFloat(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-6 py-4 text-sm font-bold outline-none focus:border-white/30 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Description</label>
                      <input
                        type="text"
                        value={externalDescription}
                        onChange={e => setExternalDescription(e.target.value)}
                        placeholder="Short description..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-white/30 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-purple-400/5 border border-purple-400/20 rounded-2xl">
                  <p className="text-[9px] font-bold text-purple-400/80 uppercase tracking-widest">
                    ✦ Customers will see this product on Plajah. Clicking "Buy Now" sends them to your store to complete the purchase. Your store handles fulfillment.
                  </p>
                </div>

                {error && <p className="mt-4 text-center text-red-400 text-xs font-bold">{error}</p>}

                <div className="mt-8 flex justify-between">
                  <button onClick={goBack} className="px-6 py-3 text-white/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={handlePublishExternal}
                    disabled={!externalStoreUrl || !externalProductName}
                    className="px-8 py-4 bg-purple-500 text-white rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100 shadow-2xl"
                  >
                    Add to Store <Link2 size={14} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Upload Design ── */}
            {step === 'upload-design' && (
              <motion.div key="upload" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-6">Upload your design</h3>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-[2rem] p-12 text-center cursor-pointer transition-all ${
                    designPreview ? 'border-small-orange/50 bg-small-orange/5' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleFileChange} className="hidden" />
                  {designPreview ? (
                    <div className="flex flex-col items-center gap-4">
                      <img src={designPreview} alt="Design preview" className="max-h-48 object-contain rounded-xl" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-small-orange">{designFile?.name}</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest">Click to change</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-white/30">
                      <Upload size={40} />
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest mb-1">Drop your design here</p>
                        <p className="text-[9px] uppercase tracking-widest">PNG, SVG, or JPG · Min 1800px recommended</p>
                      </div>
                    </div>
                  )}
                </div>

                {error && <p className="mt-4 text-center text-red-400 text-xs font-bold">{error}</p>}

                <div className="mt-8 flex justify-between">
                  <button onClick={goBack} className="px-6 py-3 text-white/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={handleUploadAndPreview}
                    disabled={!designFile || loading}
                    className="px-8 py-4 bg-small-orange text-white rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100"
                  >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Uploading...</> : <>Preview <ChevronRight size={14} /></>}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Preview ── */}
            {step === 'preview' && (
              <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-6">Product preview</h3>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 size={40} className="animate-spin text-small-orange" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 animate-pulse">Generating mockups...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {mockupUrls.length > 0 ? mockupUrls.map((url, i) => (
                      <div key={i} className="aspect-square rounded-[1.5rem] overflow-hidden border border-white/10 bg-white/5">
                        <img src={url} alt={`Mockup ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    )) : (
                      <div className="col-span-3 py-12 text-center text-white/20">
                        <ImageIcon size={40} className="mx-auto mb-4" />
                        <p className="text-xs font-black uppercase tracking-widest">Mockups unavailable — continue to set pricing</p>
                      </div>
                    )}
                  </div>
                )}
                {!loading && (
                  <div className="mt-8 flex justify-between">
                    <button onClick={goBack} className="px-6 py-3 text-white/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      <ChevronLeft size={14} /> Back
                    </button>
                    <button onClick={goNext} className="px-8 py-4 bg-small-orange text-white rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all">
                      Set Price <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 5: Pricing ── */}
            {step === 'pricing' && (
              <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-6">Product details & pricing</h3>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Product Name</label>
                    <input type="text" value={productName}
                      onChange={e => setProductName(e.target.value)}
                      placeholder={(mode === 'printful' ? pfSelectedProduct?.title : glSelectedProduct?.title) ?? 'e.g. Limited Drop Tee'}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-small-orange/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Description</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="Tell the story of this drop..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-medium outline-none focus:border-small-orange/50 transition-all h-20 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Base Cost ({mode === 'printful' ? 'Printful' : 'Gelato'})</label>
                      <div className="flex items-center gap-2 px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl text-white/30">
                        <DollarSign size={14} />
                        <span className="text-sm font-bold">{selectedBaseCost}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Your Retail Price</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-small-orange" />
                        <input type="number" value={retailPrice}
                          onChange={e => setRetailPrice(parseFloat(e.target.value))}
                          className="w-full bg-white/5 border border-small-orange/30 rounded-2xl pl-10 pr-6 py-4 text-sm font-bold outline-none focus:border-small-orange transition-all"
                        />
                      </div>
                      <p className="text-[9px] text-white/20 pl-1">
                        Profit: <span className="text-green-400 font-bold">${Math.max(0, retailPrice - parseFloat(selectedBaseCost as string || '0')).toFixed(2)}</span> per unit
                      </p>
                    </div>
                  </div>
                </div>
                {error && <p className="mt-4 text-center text-red-400 text-xs font-bold">{error}</p>}
                <div className="mt-8 flex justify-between">
                  <button onClick={goBack} className="px-6 py-3 text-white/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button onClick={handlePublishPOD} disabled={!retailPrice || loading}
                    className="px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100 shadow-2xl"
                  >
                    Publish to Store <Sparkles size={14} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Publishing ── */}
            {step === 'publishing' && (
              <motion.div key="publishing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8">
                <div className="flex flex-col items-center justify-center py-20 gap-6">
                  {loading ? (
                    <>
                      <div className="relative">
                        <Loader2 size={48} className="animate-spin text-small-orange" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          {mode === 'external' ? <Link2 size={20} className="text-white" /> : <Shirt size={20} className="text-white" />}
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-black uppercase tracking-widest mb-2">
                          {mode === 'external' ? 'Linking your store...' : 'Publishing your merch...'}
                        </p>
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">
                          {mode === 'printful' ? 'Syncing with Printful fulfillment network' :
                           mode === 'gelato' ? 'Connecting to Gelato global print network' :
                           'Adding product to your Plajah storefront'}
                        </p>
                      </div>
                    </>
                  ) : error ? (
                    <div className="text-center">
                      <p className="text-red-400 font-bold mb-4">{error}</p>
                      <button onClick={goBack} className="px-6 py-3 bg-white/10 rounded-full text-xs font-black uppercase tracking-widest">Try Again</button>
                    </div>
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/30">
                        <Check size={32} className="text-green-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black uppercase tracking-tight mb-2">Live on your store!</p>
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">
                          {mode === 'printful' ? 'Printful handles printing, packing & shipping' :
                           mode === 'gelato' ? 'Gelato ships from the closest printer to your customer' :
                           'Customers will be directed to your store at checkout'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default MerchBuilder;
