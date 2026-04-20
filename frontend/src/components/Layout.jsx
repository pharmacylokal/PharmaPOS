import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  api,
  getApiBaseUrl,
  getPendingSyncCount,
  setApiBaseUrl,
  subscribeToSyncStatus,
  syncPendingChanges,
} from '../api/client';

// ============================================================
// TAB CONFIGURATION - Role-based visibility
// ============================================================
const ALL_TABS = [
  { id: 'pos',       label: 'POS',       icon: '??' },
  { id: 'inventory', label: 'Inventory', icon: '??' },
  { id: 'reports',   label: 'Reports',   icon: '??' },
];

export default function Layout({ activeTab, setActiveTab, children }) {
  const { user, logout, isAdmin } = useAuth();
  
  // Filter tabs based on role
  // Cashiers can only access POS
  const visibleTabs = isAdmin() 
    ? ALL_TABS 
    : ALL_TABS.filter(tab => tab.id === 'pos');
  
  // Redirect cashiers away from restricted tabs
  useEffect(() => {
    if (!isAdmin() && visibleTabs.length === 1 && activeTab !== 'pos') {
      setActiveTab('pos');
    }
  }, [isAdmin, visibleTabs, activeTab, setActiveTab]);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [apiStatus, setApiStatus] = useState('checking');
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [draftApiUrl, setDraftApiUrl] = useState(getApiBaseUrl());
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingSyncCount());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    return subscribeToSyncStatus((status) => {
      if (typeof status.pending === 'number') setPendingSyncCount(status.pending);
      if (typeof status.syncing === 'boolean') setIsSyncing(status.syncing);
      if ((status.synced_total || 0) > 0 && !status.syncing) {
        toast.success(`Synced ${status.synced_total} offline change${status.synced_total > 1 ? 's' : ''}`);
      }
    });
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      setApiStatus('checking');
      try {
        await api.getHealth();
        if (!cancelled) {
          setApiStatus('online');
          if (getPendingSyncCount() > 0) {
            await syncPendingChanges();
          }
        }
      } catch (_) {
        if (!cancelled) setApiStatus('offline');
      }
    }

    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!isOnline || apiStatus !== 'online') return undefined;
    const timer = setInterval(() => {
      if (getPendingSyncCount() > 0) {
        syncPendingChanges();
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [isOnline, apiStatus]);

  const statusLabel = useMemo(() => {
    if (!isOnline) return { text: 'Offline', className: 'bg-red-100 text-red-700' };
    if (apiStatus === 'online') return { text: 'API Connected', className: 'bg-green-100 text-green-700' };
    if (apiStatus === 'offline') return { text: 'API Unreachable', className: 'bg-amber-100 text-amber-700' };
    return { text: 'Checking API', className: 'bg-gray-100 text-gray-700' };
  }, [isOnline, apiStatus]);

  const handleSaveApiUrl = () => {
    const next = setApiBaseUrl(draftApiUrl);
    setApiUrl(next);
    setShowApiSettings(false);
    toast.success('API URL updated');
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navbar */}
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">??</span>
            <div>
              <h1 className="text-lg font-bold leading-none">PharmaPOS</h1>
              <p className="text-xs text-blue-200">Pharmacy Inventory & POS System</p>
            </div>
          </div>
          
          {/* Navigation tabs - only show tabs user can access */}
          <nav className="flex gap-1">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700'
                    : 'text-blue-100 hover:bg-blue-600'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
          
          <div className="flex items-center gap-3">
            {/* Status badges */}
            <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusLabel.className}`}>
              {statusLabel.text}
            </div>
            <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${pendingSyncCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
              {isSyncing ? `Syncing ${pendingSyncCount}` : `Pending Sync ${pendingSyncCount}`}
            </div>
            
            {/* User info and logout - only for logged in users */}
            {user && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-lg">
                  <span className="text-sm font-medium">{user.username}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    user.role === 'admin' 
                      ? 'bg-amber-400 text-amber-900' 
                      : 'bg-blue-300 text-blue-900'
                  }`}>
                    {user.role === 'admin' ? 'ADMIN' : 'CASHIER'}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white"
                  title="Logout"
                >
                  Logout
                </button>
              </>
            )}
            
            <button
              onClick={() => { setDraftApiUrl(apiUrl); setShowApiSettings(true); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-blue-50"
            >
              API Settings
            </button>
            <div className="text-xs text-blue-200">
              {new Date().toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      <div className="border-b bg-white/90">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-4 text-xs text-gray-600">
          <p className="truncate">
            API target: <span className="font-semibold text-gray-800">{apiUrl}</span>
          </p>
          <p className="text-right">
            Offline use works on this device once the app shell is cached.
            Remote monitoring requires the API to be hosted on a reachable server.
          </p>
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-4">
        {children}
      </main>

      {showApiSettings && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">API Settings</h2>
                <p className="text-sm text-gray-500">
                  Use your local API for in-store use, or point this app to a hosted backend for remote monitoring.
                </p>
              </div>
              <button onClick={() => setShowApiSettings(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">Backend API URL</label>
            <input
              type="url"
              value={draftApiUrl}
              onChange={(e) => setDraftApiUrl(e.target.value)}
              placeholder="http://localhost:3001"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            <div className="mt-3 rounded-xl bg-blue-50 text-blue-900 text-sm p-3">
              Example local URL: <code>http://localhost:3001</code>
              <br />
              Example hosted URL: <code>https://your-api.example.com</code>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  const next = setApiBaseUrl('');
                  setDraftApiUrl(next);
                  setApiUrl(next);
                  toast.success('API URL reset to default');
                }}
                className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
              >
                Reset Default
              </button>
              <button
                onClick={handleSaveApiUrl}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
              >
                Save API URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
