import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Product } from '../types/business';
import { formatCurrency, resizeImageFileToDataUrl } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';

interface ProductsViewProps {
  products: Product[];
  currencySymbol: string;
  defaultLowStock: number;
  onBack: () => void;
  onSaveProduct: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
}

const CATEGORIES = [
  'Sarees & Ethnic',
  'Kurtis & Sets',
  'Dresses & Western',
  'Cosmetics & Beauty',
  'Jewellery & Accessories',
  'Footwear & Bags',
  'Other',
];

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  currencySymbol,
  defaultLowStock,
  onBack,
  onSaveProduct,
  onDeleteProduct,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState(String(defaultLowStock || 5));
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');

  const openCreate = () => {
    setEditing(null);
    setName('');
    setImageDataUrl('');
    setCategory(CATEGORIES[0]);
    setPurchasePrice('');
    setSellingPrice('');
    setStockQty('');
    setLowStockAlert(String(defaultLowStock || 5));
    setSize('');
    setColor('');
    setError('');
    setFormOpen(true);
  };

  const openEdit = (prod: Product) => {
    setEditing(prod);
    setName(prod.name);
    setImageDataUrl(prod.imageDataUrl || '');
    setCategory(prod.category || CATEGORIES[0]);
    setPurchasePrice(String(prod.purchasePrice));
    setSellingPrice(String(prod.sellingPrice));
    setStockQty(String(prod.stockQty));
    setLowStockAlert(String(prod.lowStockAlert || defaultLowStock || 5));
    setSize(prod.size || '');
    setColor(prod.color || '');
    setError('');
    setFormOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 480);
      setImageDataUrl(dataUrl);
    } catch {
      setError('Could not load selected image. Please choose a valid JPG/PNG.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    const buy = Number(purchasePrice) || 0;
    const sell = Number(sellingPrice) || 0;
    if (sell <= 0) {
      setError('Selling price must be greater than zero.');
      return;
    }

    setBusy(true);
    try {
      await onSaveProduct(
        {
          name: name.trim(),
          imageDataUrl,
          category,
          purchasePrice: Math.max(0, buy),
          sellingPrice: Math.max(0, sell),
          stockQty: Math.max(0, Math.floor(Number(stockQty) || 0)),
          lowStockAlert: Math.max(1, Math.floor(Number(lowStockAlert) || 5)),
          size: size.trim(),
          color: color.trim(),
        },
        editing?.id
      );
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setBusy(false);
    }
  };

  const lowStockItems = useMemo(
    () =>
      products.filter(
        (p) => p.stockQty <= (p.lowStockAlert || defaultLowStock || 5)
      ),
    [products, defaultLowStock]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        p.size.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter]);

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              Products &amp; Inventory ({products.length})
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Manage catalog items, pricing, sizes, colors, and automatic stock tracking.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="rounded-2xl border border-[#FBCFE8] bg-[#FFF1F6] p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#BE185D]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Low Stock Alert ({lowStockItems.length} items)</span>
          </div>
          <p className="text-xs text-[#9D174D]">
            {lowStockItems
              .map((p) => `${p.name} (${p.stockQty} left)`)
              .join(' · ')}
          </p>
        </div>
      )}

      {/* Add / Edit Product Drawer Card */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#D8B4FE] bg-white p-5 sm:p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#F4ECF8] pb-3">
            <h2 className="text-base font-bold text-[#1F122B]">
              {editing ? 'Edit Product' : 'Add New Product'}
            </h2>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="w-20 h-20 rounded-2xl border border-[#EFE2F5] bg-[#FDF8FC] flex items-center justify-center overflow-hidden shrink-0">
              {imageDataUrl ? (
                <img
                  src={imageDataUrl}
                  alt={name || 'Product'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-7 h-7 text-[#C084FC]" />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#4A3B59]">Product Image</div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="sr-only"
                  />
                </label>
                {imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => setImageDataUrl('')}
                    className="text-xs font-medium text-[#BE123C] cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Product Name <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Banarasi Silk Kurti Set"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Purchase Price ({currencySymbol})
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Selling Price ({currencySymbol}) <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Stock Quantity
              </label>
              <input
                type="number"
                min={0}
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Size
              </label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="M, L, XL or Free Size"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Color
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Rose Pink"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Low Stock Alert At
              </label>
              <input
                type="number"
                min={1}
                value={lowStockAlert}
                onChange={(e) => setLowStockAlert(e.target.value)}
                className={`${inputClass} font-mono-num`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#F4ECF8]">
            <div className="text-xs text-[#6B5B7B] font-mono-num">
              Unit Profit:{' '}
              <strong className="text-[#15803D]">
                {formatCurrency(
                  Math.max(0, (Number(sellingPrice) || 0) - (Number(purchasePrice) || 0)),
                  currencySymbol
                )}
              </strong>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E6D9EE] text-xs font-semibold text-[#5B4B6B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                {busy ? 'Saving...' : editing ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, size, or color..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none cursor-pointer"
        >
          <option value="ALL">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-16 px-6 text-center">
          <h3 className="text-base font-bold text-[#1F122B] mb-1">
            {products.length === 0 ? 'No products in catalog yet' : 'No matching products'}
          </h3>
          <p className="text-sm text-[#6B5B7B] mb-5">
            Add your boutique products with purchase &amp; selling prices to track profit and stock automatically.
          </p>
          {products.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Product</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((prod) => {
            const isLow = prod.stockQty <= (prod.lowStockAlert || defaultLowStock || 5);
            const profitPerUnit = prod.sellingPrice - prod.purchasePrice;

            return (
              <div
                key={prod.id}
                className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="h-44 bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] flex items-center justify-center overflow-hidden border-b border-[#F4ECF8]">
                    {prod.imageDataUrl ? (
                      <img
                        src={prod.imageDataUrl}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-10 h-10 text-[#C084FC]" />
                    )}
                  </div>

                  <div className="p-4 space-y-2.5">
                    <div className="text-[11px] font-medium text-[#7E22CE]">
                      {prod.category}
                      {prod.size ? ` · Size ${prod.size}` : ''}
                      {prod.color ? ` · ${prod.color}` : ''}
                    </div>
                    <h3 className="text-base font-bold text-[#1F122B] leading-snug">
                      {prod.name}
                    </h3>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F4ECF8] text-xs">
                      <div>
                        <div className="text-[#6B5B7B]">Buy</div>
                        <div className="font-mono-num font-semibold text-[#4A3B59]">
                          {formatCurrency(prod.purchasePrice, currencySymbol)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#6B5B7B]">Sell</div>
                        <div className="font-mono-num font-bold text-[#7E22CE]">
                          {formatCurrency(prod.sellingPrice, currencySymbol)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#6B5B7B]">Profit</div>
                        <div className="font-mono-num font-semibold text-[#15803D]">
                          {formatCurrency(profitPerUnit, currencySymbol)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 bg-[#FDFBFE] border-t border-[#F4ECF8] flex items-center justify-between gap-2">
                  <div
                    className={`font-mono-num text-xs font-bold ${
                      isLow ? 'text-[#BE123C]' : 'text-[#1F122B]'
                    }`}
                  >
                    Stock: {prod.stockQty}
                    {isLow ? ' (Low)' : ''}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(prod)}
                      className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer"
                      title="Edit product"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(prod)}
                      className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                      title="Delete product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}" from your catalog?`}
        confirmLabel="Delete Product"
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await onDeleteProduct(deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
