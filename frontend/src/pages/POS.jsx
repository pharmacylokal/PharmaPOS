import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const DISCOUNT_OPTIONS = [
  { value: '', label: 'No Discount', pct: 0 },
  { value: 'senior', label: 'Senior Citizen (20%)', pct: 20 },
  { value: 'pwd', label: 'PWD (20%)', pct: 20 },
  { value: 'manual', label: 'Manual Discount', pct: 0 },
];

// Format to PHP peso
const peso = (n) => `₱${parseFloat(n || 0).toFixed(2)}`;

export default function POS() {
  const { user, hasPermission } = useAuth();
  const [searchTerm, setSearchTerm]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [cart, setCart]                 = useState([]);
  const [discountType, setDiscountType] = useState('');
  const [discountPct, setDiscountPct]   = useState(0);
  const [cashTendered, setCashTendered] = useState('');
  const [processing, setProcessing]     = useState(false);
  const [receipt, setReceipt]           = useState(null);  // Shows after successful sale
  const searchRef = useRef(null);

  // Auto-focus search on load and after sale
  useEffect(() => { searchRef.current?.focus(); }, [receipt]);

  // Product search — triggered on input change (debounced 300ms)
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await api.getProducts({ search: searchTerm });
        setSearchResults(results.filter(p => p.total_stock > 0));
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle barcode scanner — scanners type quickly and end with Enter
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchResults.length === 1) {
      addToCart(searchResults[0]);
    }
  };

  // Add product to cart (or increase qty if already there)
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        // Check stock limit
        if (existing.quantity >= product.total_stock) {
          toast.error(`Only ${product.total_stock} units available`);
          return prev;
        }
        return prev.map(i =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        generic_name: product.generic_name,
        price: parseFloat(product.current_price ?? product.min_price ?? 0),  // FIFO-facing batch price
        quantity: 1,
        max_stock: product.total_stock,
      }];
    });
    setSearchTerm('');
    setSearchResults([]);
    searchRef.current?.focus();
  }, []);

  // Update cart item quantity
  const updateQty = (productId, qty) => {
    if (qty < 1) { removeFromCart(productId); return; }
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      if (qty > i.max_stock) { toast.error(`Only ${i.max_stock} units in stock`); return i; }
      return { ...i, quantity: qty };
    }));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  };

  // —— Totals calculation ——
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discAmt = subtotal * (parseFloat(discountPct) / 100);
  const total = subtotal - discAmt;
  const change = cashTendered ? parseFloat(cashTendered) - total : 0;

  // Handle discount type change
  const handleDiscountChange = (e) => {
    const opt = DISCOUNT_OPTIONS.find(o => o.value === e.target.value);
    setDiscountType(e.target.value);
    if (e.target.value !== 'manual') setDiscountPct(opt?.pct || 0);
  };

  // —— Checkout ——
  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (!cashTendered || parseFloat(cashTendered) < total) {
      return toast.error('Insufficient cash tendered');
    }

    setProcessing(true);
    try {
      const result = await api.createSale({
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        discount_type: discountType || null,
        discount_pct: parseFloat(discountPct) || 0,
        cash_tendered: parseFloat(cashTendered),
        cashier: user?.username || 'staff',
      });

      if (result.queued_offline) {
        toast.success(`Sale saved offline. Pending sync: ${result.pending_sync_count}`);
      } else {
        toast.success('Sale completed!');
      }
      setReceipt({ ...result, cart, subtotal, discAmt, total, cashTendered: parseFloat(cashTendered) });
      setCart([]);
      setDiscountType('');
      setDiscountPct(0);
      setCashTendered('');
    } catch (err) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
  };

  if (receipt) return <ReceiptView receipt={receipt} onClose={() => setReceipt(null)} />;

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* Left panel — product search + cart */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b">
          <input
            ref={searchRef}
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by name, generic, or barcode..."
            className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="border-b max-h-48 overflow-y-auto">
            {searchResults.map(product => (
              <ProductRow key={product.id} product={product} onAdd={addToCart} />
            ))}
          </div>
        )}

        {/* Cart */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-2">🛒</p>
              <p>Search products to start a sale</p>
            </div>
          ) : (
            <div className="divide-y">
              {cart.map(item => (
                <CartItem
                  key={item.product_id}
                  item={item}
                  onQtyChange={updateQty}
                  onRemove={removeFromCart}
                />
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t bg-gray-50 p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span><span>{peso(subtotal)}</span>
          </div>
          {discAmt > 0 && (
            <div className="flex justify-between text-green-600 text-sm font-medium">
              <span>Discount</span><span>-{peso(discAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>TOTAL</span><span className="text-blue-700">{peso(total)}</span>
          </div>
        </div>
      </div>

      {/* Right panel — payment */}
      <div className="w-80 flex flex-col gap-4">
        {/* Discount */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Discount</h3>
          <select
            value={discountType}
            onChange={handleDiscountChange}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {DISCOUNT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {discountType === 'manual' && (
            <div className="mt-2">
              <label className="block text-xs text-gray-500 mb-1">Discount %</label>
              <input
                type="number" min="0" max="100"
                value={discountPct}
                onChange={e => setDiscountPct(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}
          {discAmt > 0 && (
            <p className="mt-2 text-sm text-green-600 font-medium">
              Saving {peso(discAmt)}
            </p>
          )}
        </div>

        {/* Cash tendered */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Payment</h3>
          <label className="block text-xs text-gray-500 mb-1">Cash Tendered</label>
          <input
            type="number" min="0" step="0.01"
            value={cashTendered}
            onChange={e => setCashTendered(e.target.value)}
            placeholder="₱0.00"
            className="w-full border rounded-lg px-3 py-2.5 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {change > 0 && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-blue-500">Change</p>
              <p className="text-2xl font-bold text-blue-700">{peso(change)}</p>
            </div>
          )}
        </div>

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          disabled={cart.length === 0 || processing || !cashTendered || parseFloat(cashTendered) < total}
          className={`w-full py-4 rounded-xl font-bold text-lg shadow transition-all ${
            cart.length > 0 && cashTendered && parseFloat(cashTendered) >= total && !processing
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {processing ? 'Processing...' : `Pay ${peso(total)}`}
        </button>
      </div>
    </div>
  );
}

function ProductRow({ product, onAdd }) {
  const isLowStock = product.total_stock <= 10;
  const isExpiringSoon = product.nearest_expiry &&
    (new Date(product.nearest_expiry) - new Date()) < 30 * 86400000;

  return (
    <button
      onClick={() => onAdd(product)}
      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-800 truncate">{product.name}</p>
        {product.generic_name && <p className="text-xs text-gray-500">{product.generic_name}</p>}
        {product.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{product.category}</span>}
      </div>
      <div className="text-right">
        <p className="font-bold text-blue-700">₱{parseFloat(product.current_price ?? product.min_price ?? 0).toFixed(2)}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isLowStock ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
        }`}>
          {product.total_stock} in stock
        </span>
      </div>
    </button>
  );
}

function CartItem({ item, onQtyChange, onRemove }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">₱{item.price.toFixed(2)} each</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(item.product_id, item.quantity - 1)}
          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">−</button>
        <input
          type="number" min="1"
          value={item.quantity}
          onChange={e => onQtyChange(item.product_id, parseInt(e.target.value))}
          className="w-12 text-center border rounded text-sm py-0.5"
        />
        <button onClick={() => onQtyChange(item.product_id, item.quantity + 1)}
          className="w-7 h-7 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-sm">+</button>
      </div>
      <div className="text-right w-20">
        <p className="font-bold text-sm">₱{(item.price * item.quantity).toFixed(2)}</p>
      </div>
      <button onClick={() => onRemove(item.product_id)} className="text-red-400 hover:text-red-600 text-lg ml-1">×</button>
    </div>
  );
}

function ReceiptView({ receipt, onClose }) {
  const { sale, cart, subtotal, discAmt, total, cashTendered } = receipt;
  const change = cashTendered - total;
  const handlePrint = () => window.print();

  return (
    <div className="max-w-md mx-auto">
      <div id="receipt" className="bg-white border rounded-xl p-6 shadow-lg font-mono text-sm">
        <div className="text-center border-b pb-4 mb-4">
          <p className="text-xl font-bold">💊 PharmaPOS</p>
          <p className="text-xs text-gray-500">Official Receipt</p>
          {receipt.queued_offline && (
            <p className="text-xs text-amber-700 font-semibold">Offline sale - pending sync</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {new Date(sale.date).toLocaleString('en-PH')}
          </p>
          <p className="text-xs text-gray-400">OR #{sale.id.toString().padStart(6, '0')}</p>
        </div>

        {/* Line items */}
        <div className="space-y-1 mb-4">
          {cart.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span className="flex-1 truncate">{item.name}</span>
              <span className="ml-2 text-gray-500">{item.quantity}x</span>
              <span className="ml-2 w-20 text-right">₱{(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="border-t pt-3 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span></div>
          {discAmt > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({sale.discount_type?.toUpperCase()})</span>
              <span>-₱{discAmt.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base border-t mt-2 pt-2">
            <span>TOTAL</span><span>₱{total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Cash</span><span>₱{cashTendered.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Change</span><span>₱{change.toFixed(2)}</span>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 mt-6 border-t pt-4">
          <p>Thank you for your purchase!</p>
          <p>Please keep this receipt</p>
        </div>
      </div>

      <div className="flex gap-3 mt-4 print:hidden">
        <button onClick={handlePrint}
          className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-800">
          🖨 Print Receipt
        </button>
        <button onClick={onClose}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">
          ✅ New Sale
        </button>
      </div>
    </div>
  );
}