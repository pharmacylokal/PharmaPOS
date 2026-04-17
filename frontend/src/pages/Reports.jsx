import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(30);
  const [salesDate, setSalesDate] = useState('');
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const requestSeqRef = useRef(0);

  const loadReport = async () => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setData(null);
    try {
      let result;
      if (activeTab === 'daily')     result = await api.getDailyReport(dailyDate);
      if (activeTab === 'inventory') result = await api.getInventoryReport();
      if (activeTab === 'expiring')  result = await api.getExpiringReport(expiryDays);
      if (activeTab === 'history')   result = await api.getSales(salesDate ? { date: salesDate, limit: 100 } : { limit: 100 });
      if (requestSeq === requestSeqRef.current) {
        setData(result);
      }
    } catch (e) { toast.error('Failed to load report'); }
    finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => { loadReport(); }, [activeTab, dailyDate, expiryDays, salesDate]);

  const tabs = [
    { id: 'daily',     label: '📅 Daily Sales' },
    { id: 'inventory', label: '📦 Inventory' },
    { id: 'expiring',  label: '⚠ Expiring' },
  ];
  const allTabs = tabs.concat([{ id: 'history', label: 'Recent Transactions' }]);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 bg-white rounded-xl border p-2">
        {allTabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Daily Sales Report */}
      {activeTab === 'daily' && (
        <DailyReport
          date={dailyDate}
          onDateChange={setDailyDate}
          data={data}
          loading={loading}
        />
      )}

      {/* Inventory Report */}
      {activeTab === 'inventory' && (
        <InventoryReport data={data} loading={loading} />
      )}

      {/* Expiring Report */}
      {activeTab === 'expiring' && (
        <ExpiringReport
          days={expiryDays}
          onDaysChange={setExpiryDays}
          data={data}
          loading={loading}
        />
      )}

      {activeTab === 'history' && (
        <SalesHistoryReport
          date={salesDate}
          onDateChange={setSalesDate}
          data={data}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── Daily Sales Report ────────────────────────────────────────
function DailyReport({ date, onDateChange, data, loading }) {
  const csvUrl = api.getCsvUrl('daily', { date });
  const summary = data?.summary || {
    total_transactions: 0,
    total_revenue: 0,
    discounted_sales: 0,
    sc_pwd_transactions: 0,
  };
  const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white rounded-xl border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Date:</label>
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <a href={csvUrl} download className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">
          ⬇ Export CSV
        </a>
      </div>

      {loading ? <Spinner /> : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="Transactions" value={summary.total_transactions} color="blue" />
            <SummaryCard label="Revenue" value={`₱${parseFloat(summary.total_revenue).toFixed(2)}`} color="green" />
            <SummaryCard label="Discounted Sales" value={`₱${parseFloat(summary.discounted_sales || 0).toFixed(2)}`} color="amber" />
            <SummaryCard label="SC/PWD Transactions" value={summary.sc_pwd_transactions} color="purple" />
          </div>

          {/* Product breakdown */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-gray-800">Sales Breakdown by Product</h3>
            </div>
            {breakdown.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No sales on this date</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600">Product</th>
                    <th className="text-left px-4 py-2 text-gray-600">Category</th>
                    <th className="text-center px-4 py-2 text-gray-600">Units Sold</th>
                    <th className="text-right px-4 py-2 text-gray-600">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {breakdown.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.product_name}</p>
                        {row.generic_name && <p className="text-xs text-gray-500">{row.generic_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.category}</td>
                      <td className="px-4 py-3 text-center font-bold">{row.units_sold}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">
                        ₱{parseFloat(row.revenue).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Transactions list */}
          {transactions.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-4 border-b">
                <h3 className="font-bold text-gray-800">All Transactions</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600">Time</th>
                    <th className="text-left px-4 py-2 text-gray-600">Cashier</th>
                    <th className="text-left px-4 py-2 text-gray-600">Discount</th>
                    <th className="text-right px-4 py-2 text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{new Date(tx.date).toLocaleTimeString('en-PH')}</td>
                      <td className="px-4 py-3">{tx.cashier}</td>
                      <td className="px-4 py-3">
                        {tx.discount_type ? (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">
                            {tx.discount_type} {tx.discount_pct}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">₱{parseFloat(tx.total_amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Inventory Report ──────────────────────────────────────────
function InventoryReport({ data, loading }) {
  const csvUrl = api.getCsvUrl('inventory');
  const inventory = Array.isArray(data?.inventory) ? data.inventory : [];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-4 flex justify-between items-center">
        <p className="text-sm text-gray-600">{inventory.length} products tracked</p>
        <a href={csvUrl} download className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">
          ⬇ Export CSV
        </a>
      </div>

      {data && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600">Product</th>
                <th className="text-left px-4 py-2 text-gray-600">Category</th>
                <th className="text-center px-4 py-2 text-gray-600">Batches</th>
                <th className="text-center px-4 py-2 text-gray-600">Available Stock</th>
                <th className="text-center px-4 py-2 text-gray-600">Expired Stock</th>
                <th className="text-center px-4 py-2 text-gray-600">Nearest Expiry</th>
                <th className="text-right px-4 py-2 text-gray-600">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inventory.map(item => {
                const isLow = item.available_stock > 0 && item.available_stock <= 10;
                const isOut = item.available_stock === 0;
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${isOut ? 'bg-red-50' : isLow ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name}</p>
                      {item.generic_name && <p className="text-xs text-gray-500">{item.generic_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.category}</td>
                    <td className="px-4 py-3 text-center">{item.batch_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                        isOut ? 'bg-red-200 text-red-800' : isLow ? 'bg-orange-200 text-orange-800' : 'bg-green-100 text-green-700'
                      }`}>
                        {isOut ? '⛔ 0' : item.available_stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.expired_stock > 0 ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          ⚠ {item.expired_stock} expired
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">
                      {item.nearest_expiry || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      {item.min_price === item.max_price
                        ? `₱${parseFloat(item.min_price || 0).toFixed(2)}`
                        : `₱${parseFloat(item.min_price || 0).toFixed(2)} – ₱${parseFloat(item.max_price || 0).toFixed(2)}`
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Expiring Report ───────────────────────────────────────────
function ExpiringReport({ days, onDaysChange, data, loading }) {
  const expiring = Array.isArray(data?.expiring) ? data.expiring : [];
  const expired = Array.isArray(data?.expired) ? data.expired : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Show products expiring within:</label>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => onDaysChange(d)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              days === d ? 'bg-amber-500 text-white' : 'border hover:bg-gray-50'
            }`}>
            {d} days
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : data && (
        <div className="space-y-4">
          {/* Already expired */}
          {expired.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="p-4 bg-red-50 border-b border-red-200">
                <h3 className="font-bold text-red-800">⛔ Already Expired — Do NOT sell ({expired.length} batches)</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-red-700">Product</th>
                    <th className="text-left px-4 py-2 text-red-700">Batch #</th>
                    <th className="text-center px-4 py-2 text-red-700">Expired</th>
                    <th className="text-center px-4 py-2 text-red-700">Days Ago</th>
                    <th className="text-center px-4 py-2 text-red-700">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {expired.map(b => (
                    <tr key={b.batch_id} className="bg-red-50/50">
                      <td className="px-4 py-2 font-medium">{b.product_name}</td>
                      <td className="px-4 py-2 text-gray-600">{b.batch_number}</td>
                      <td className="px-4 py-2 text-center text-red-700">{b.expiry_date}</td>
                      <td className="px-4 py-2 text-center text-red-700 font-bold">{b.days_expired} days</td>
                      <td className="px-4 py-2 text-center font-bold">{b.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expiring soon */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-bold text-amber-800">
                ⚠ Expiring Within {days} Days ({expiring.length} batches)
              </h3>
            </div>
            {expiring.length === 0 ? (
              <p className="text-center text-green-600 py-8 font-medium">✅ No items expiring within {days} days</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600">Product</th>
                    <th className="text-left px-4 py-2 text-gray-600">Batch #</th>
                    <th className="text-left px-4 py-2 text-gray-600">Category</th>
                    <th className="text-center px-4 py-2 text-gray-600">Expiry Date</th>
                    <th className="text-center px-4 py-2 text-gray-600">Days Left</th>
                    <th className="text-center px-4 py-2 text-gray-600">Qty</th>
                    <th className="text-right px-4 py-2 text-gray-600">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expiring.map(b => (
                    <tr key={b.batch_id} className={b.days_until_expiry <= 30 ? 'bg-red-50' : 'bg-amber-50/50'}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.product_name}</p>
                        {b.generic_name && <p className="text-xs text-gray-500">{b.generic_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{b.batch_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{b.category}</td>
                      <td className="px-4 py-3 text-center font-medium">{b.expiry_date}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                          b.days_until_expiry <= 30 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                        }`}>
                          {b.days_until_expiry}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{b.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₱{parseFloat(b.selling_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────
function SalesHistoryReport({ date, onDateChange, data, loading }) {
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const openSale = async (saleId) => {
    setSelectedSale(saleId);
    setDetailsLoading(true);
    try {
      const details = await api.getSale(saleId);
      setSelectedDetails(details);
    } catch (e) {
      toast.error('Failed to load sale details');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filter by date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {date && (
            <button onClick={() => onDateChange('')} className="text-sm text-blue-600 hover:underline">
              Clear
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500">{Array.isArray(data) ? data.length : 0} transactions</p>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          {!Array.isArray(data) || data.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No transactions found</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600">Receipt #</th>
                  <th className="text-left px-4 py-2 text-gray-600">Date</th>
                  <th className="text-left px-4 py-2 text-gray-600">Cashier</th>
                  <th className="text-left px-4 py-2 text-gray-600">Discount</th>
                  <th className="text-right px-4 py-2 text-gray-600">Total</th>
                  <th className="text-right px-4 py-2 text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">#{sale.id.toString().padStart(6, '0')}</td>
                    <td className="px-4 py-3">{new Date(sale.date).toLocaleString('en-PH')}</td>
                    <td className="px-4 py-3">{sale.cashier}</td>
                    <td className="px-4 py-3">
                      {sale.discount_type ? `${sale.discount_type.toUpperCase()} ${sale.discount_pct}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">PHP {parseFloat(sale.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openSale(sale.id)} className="text-blue-600 hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedSale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Transaction #{selectedSale.toString().padStart(6, '0')}</h3>
                {selectedDetails?.sale?.date && (
                  <p className="text-sm text-gray-500">{new Date(selectedDetails.sale.date).toLocaleString('en-PH')}</p>
                )}
              </div>
              <button onClick={() => { setSelectedSale(null); setSelectedDetails(null); }} className="text-2xl leading-none text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            {detailsLoading ? (
              <Spinner />
            ) : selectedDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  <SummaryCard label="Cashier" value={selectedDetails.sale.cashier || 'cashier'} color="blue" />
                  <SummaryCard label="Total" value={`PHP ${parseFloat(selectedDetails.sale.total_amount).toFixed(2)}`} color="green" />
                  <SummaryCard label="Cash" value={`PHP ${parseFloat(selectedDetails.sale.cash_tendered || 0).toFixed(2)}`} color="amber" />
                  <SummaryCard label="Change" value={`PHP ${parseFloat(selectedDetails.sale.change_given || 0).toFixed(2)}`} color="purple" />
                </div>
                <div className="bg-white rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-600">Product</th>
                        <th className="text-left px-4 py-2 text-gray-600">Batch</th>
                        <th className="text-center px-4 py-2 text-gray-600">Qty</th>
                        <th className="text-right px-4 py-2 text-gray-600">Price</th>
                        <th className="text-right px-4 py-2 text-gray-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDetails.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.product_name}</p>
                            {item.generic_name && <p className="text-xs text-gray-500">{item.generic_name}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{item.batch_number}</td>
                          <td className="px-4 py-3 text-center">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">PHP {parseFloat(item.price).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-semibold">PHP {parseFloat(item.subtotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-800 border-blue-200',
    green:  'bg-green-50 text-green-800 border-green-200',
    amber:  'bg-amber-50 text-amber-800 border-amber-200',
    purple: 'bg-purple-50 text-purple-800 border-purple-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-2xl animate-pulse">⏳ Loading report...</p>
    </div>
  );
}


