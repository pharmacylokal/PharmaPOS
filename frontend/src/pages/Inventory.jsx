import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

const CATEGORIES = ['Antibiotics', 'Vitamins & Supplements', 'Analgesics', 'Antacids', 
  'Antihistamines', 'Cardiovascular', 'Diabetes', 'Dermatology', 
  'Eye/Ear Drops', 'Cough & Cold', 'Other'];

export default function Inventory() {
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState(CATEGORIES);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct]   = useState(null);
  const [showBatchForm, setShowBatchForm]     = useState(false);
  const [editingBatch, setEditingBatch]       = useState(null);
  const [productBatches, setProductBatches]   = useState([]);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts({ search: searchTerm, category: filterCat });
      setProducts(data);
    } catch (e) { toast.error('Failed to load products'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, filterCat]);

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(Array.from(new Set([...CATEGORIES, ...data.filter(Boolean)])));
    } catch (e) {
      setCategories(CATEGORIES);
    }
  };

  const loadBatches = async (productId) => {
    try {
      const data = await api.getBatches(productId);
      setProductBatches(data);
    } catch (e) { toast.error('Failed to load batches'); }
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    loadBatches(product.id);
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This removes its unsold batches too.`)) return;
    try {
      const result = await api.deleteProduct(product.id);
      toast.success(result?.queued_offline ? 'Product delete queued (offline)' : 'Product deleted');
      if (selectedProduct?.id === product.id) {
        setSelectedProduct(null);
        setProductBatches([]);
      }
      loadProducts();
      loadCategories();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (!window.confirm(`Delete batch ${batch.batch_number}?`)) return;
    try {
      const result = await api.deleteBatch(batch.id);
      toast.success(result?.queued_offline ? 'Batch delete queued (offline)' : 'Batch deleted');
      if (selectedProduct) {
        loadBatches(selectedProduct.id);
        loadProducts();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const getExpiryStatus = (date) => {
    const today = new Date();
    const expiry = new Date(date);
    const diffDays = Math.ceil((expiry - today) / 86400000);
    if (diffDays < 0) return { label: 'EXPIRED', class: 'bg-red-100 text-red-700 font-bold' };
    if (diffDays <= 30) return { label: `${diffDays}d left`, class: 'bg-red-100 text-red-700' };
    if (diffDays <= 60) return { label: `${diffDays}d left`, class: 'bg-amber-100 text-amber-700' };
    return { label: `${diffDays}d left`, class: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-100px)]">
      {/* LEFT: Product list */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="🔍 Search products..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              + Add Product
            </button>
          </div>
        </div>

        {/* Product table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-gray-400 mt-16">Loading...</p>
          ) : products.length === 0 ? (
            <div className="text-center text-gray-400 mt-16">
              <p className="text-4xl mb-2">📦</p>
              <p>No products found</p>
              <button onClick={() => { setEditingProduct(null); setShowProductForm(true); }} className="mt-3 text-blue-500 hover:underline text-sm">
                Add your first product →
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Product</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Category</th>
                  <th className="text-center px-4 py-2 text-gray-600 font-semibold">Stock</th>
                  <th className="text-center px-4 py-2 text-gray-600 font-semibold">Nearest Expiry</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map(p => {
                  const isLow = p.total_stock > 0 && p.total_stock <= 10;
                  const isOut = p.total_stock === 0;
                  const status = p.nearest_expiry ? getExpiryStatus(p.nearest_expiry) : null;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className={`cursor-pointer hover:bg-blue-50 ${
                        selectedProduct?.id === p.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.name}</p>
                        {p.generic_name && <p className="text-xs text-gray-500">{p.generic_name}</p>}
                        {p.barcode && <p className="text-xs text-gray-400">📷 {p.barcode}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {p.category && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{p.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold px-2 py-1 rounded-full text-xs ${
                          isOut ? 'bg-red-100 text-red-700' :
                          isLow ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {isOut ? '⛔ OUT' : p.total_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {status ? (
                          <span className={`text-xs px-2 py-1 rounded-full ${status.class}`}>{status.label}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingProduct(p); setShowProductForm(true); }}
                            className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectProduct(p); setShowBatchForm(true); }}
                            className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                          >
                            + Batch
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RIGHT: Batch details for selected product */}
      <div className="w-96 flex flex-col gap-3">
        {selectedProduct ? (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-blue-50">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-blue-800">{selectedProduct.name}</h3>
                  {selectedProduct.generic_name && (
                    <p className="text-xs text-blue-600">{selectedProduct.generic_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingProduct(selectedProduct); setShowProductForm(true); }}
                    className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-200"
                  >
                    Edit Product
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(selectedProduct)}
                    className="bg-red-100 text-red-700 text-xs px-3 py-1.5 rounded-lg hover:bg-red-200"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => { setShowBatchForm(true); setEditingBatch(null); }}
                    className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700"
                  >
                    + Add Batch
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
              {productBatches.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-8">No batches yet</p>
              ) : productBatches.map(batch => {
                const status = getExpiryStatus(batch.expiry_date);
                return (
                  <div key={batch.id} className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">Batch: {batch.batch_number}</p>
                        <p className="text-xs text-gray-500">Expires: {batch.expiry_date}</p>
                        <p className="text-xs text-gray-500">
                          Qty: <span className="font-bold text-gray-800">{batch.quantity}</span>
                          {' | '} Cost: ₱{parseFloat(batch.cost_price).toFixed(2)}
                          {' | '} Price: ₱{parseFloat(batch.selling_price).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.class}`}>{status.label}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingBatch(batch); setShowBatchForm(true); }}
                            className="text-xs text-blue-500 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBatch(batch)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
            <p className="text-4xl mb-2">👈</p>
            <p>Select a product to view batches</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showProductForm && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          onClose={() => setShowProductForm(false)}
          onSaved={(savedProduct) => {
            setShowProductForm(false);
            setEditingProduct(null);
            if (savedProduct && selectedProduct?.id === savedProduct.id) {
              setSelectedProduct(savedProduct);
            }
            loadProducts();
            loadCategories();
          }}
        />
      )}

      {showBatchForm && selectedProduct && (
        <BatchFormModal
          product={selectedProduct}
          batch={editingBatch}
          onClose={() => { setShowBatchForm(false); setEditingBatch(null); }}
          onSaved={() => {
            setShowBatchForm(false);
            setEditingBatch(null);
            loadBatches(selectedProduct.id);
            loadProducts();
          }}
        />
      )}
    </div>
  );
}

// ── ProductFormModal ──────────────────────────────────────────
function ProductFormModal({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(product ? {
    name: product.name || '',
    generic_name: product.generic_name || '',
    barcode: product.barcode || '',
    category: product.category || '',
  } : { name: '', generic_name: '', barcode: '', category: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('Product name is required');
    setSaving(true);
    try {
      if (product) {
        const updated = await api.updateProduct(product.id, form);
        toast.success(updated?.queued_offline ? 'Product update queued (offline)' : 'Product updated!');
        onSaved(updated);
      } else {
        const created = await api.createProduct(form);
        toast.success(created?.queued_offline ? 'Product add queued (offline)' : 'Product added!');
        onSaved(created);
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={product ? 'Edit Product' : 'Add New Product'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Brand Name *" value={form.name}
          onChange={v => setForm(f => ({ ...f, name: v }))} />
        <FormField label="Generic Name" value={form.generic_name}
          onChange={v => setForm(f => ({ ...f, generic_name: v }))} />
        <FormField label="Barcode (optional)" value={form.barcode}
          onChange={v => setForm(f => ({ ...f, barcode: v }))} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Select category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : (product ? 'Save Changes' : 'Add Product')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── BatchFormModal ────────────────────────────────────────────
function BatchFormModal({ product, batch, onClose, onSaved }) {
  const [form, setForm] = useState(batch ? {
    batch_number: batch.batch_number,
    expiry_date: batch.expiry_date,
    quantity: batch.quantity,
    cost_price: batch.cost_price,
    selling_price: batch.selling_price,
  } : { batch_number: '', expiry_date: '', quantity: '', cost_price: '', selling_price: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.batch_number || !form.expiry_date || !form.quantity || !form.selling_price) {
      return toast.error('All fields except cost price are required');
    }
    setSaving(true);
    try {
      if (batch) {
        const updated = await api.updateBatch(batch.id, form);
        toast.success(updated?.queued_offline ? 'Batch update queued (offline)' : 'Batch updated!');
      } else {
        const created = await api.createBatch({ ...form, product_id: product.id });
        toast.success(created?.queued_offline ? 'Batch add queued (offline)' : 'Batch added!');
      }
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`${batch ? 'Edit' : 'Add'} Batch — ${product.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Batch Number *" value={form.batch_number}
          onChange={v => setForm(f => ({ ...f, batch_number: v }))} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
          <input type="date" value={form.expiry_date}
            onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <FormField label="Quantity *" type="number" value={form.quantity}
          onChange={v => setForm(f => ({ ...f, quantity: v }))} />
        <FormField label="Cost Price (₱)" type="number" value={form.cost_price}
          onChange={v => setForm(f => ({ ...f, cost_price: v }))} step="0.01" />
        <FormField label="Selling Price (₱) *" type="number" value={form.selling_price}
          onChange={v => setForm(f => ({ ...f, selling_price: v }))} step="0.01" />
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : (batch ? 'Update Batch' : 'Add Batch')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Shared components ─────────────────────────────────────────
function FormField({ label, value, onChange, type = 'text', step }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} step={step}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
