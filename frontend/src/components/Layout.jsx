import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ShoppingCart, Package, BarChart2, Users as UsersIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';
import {
  api,
  getApiBaseUrl,
  getPendingSyncCount,
  setApiBaseUrl,
  subscribeToSyncStatus,
  syncPendingChanges,
} from '../api/client';

// ============================================================
// TAB CONFIGURATION - Permission-based visibility
// ============================================================
const ALL_TABS = [
  { id: 'pos',       label: 'POS',       Icon: ShoppingCart, permission: 'sales_pos' },
  { id: 'inventory', label: 'Inventory', Icon: Package, permission: 'inventory_view' },
  { id: 'reports',   label: 'Reports',   Icon: BarChart2, permission: 'reports_access' },
  { id: 'users',     label: 'Users',     Icon: UsersIcon, permission: 'users_view' },
];

export default function Layout({ activeTab, setActiveTab, children }) {

  const { user, logout, hasPermission } = useAuth();
  
  // Filter tabs based on permissions
  const visibleTabs = ALL_TABS.filter(tab => hasPermission(tab.permission));
  
  // Redirect to first available tab if current tab is not accessible
  useEffect(() => {
    const availableTabIds = visibleTabs.map(t => t.id);
    if (!availableTabIds.includes(activeTab)) {
      setActiveTab(availableTabIds[0] || 'pos');
    }
  }, [hasPermission, visibleTabs, activeTab, setActiveTab]);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [apiStatus, setApiStatus] = useState('checking');
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [showApiSettings, setShowApiSettings] = useState(false);

  const [draftApiUrl, setDraftApiUrl] = useState(getApiBaseUrl());
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingSyncCount());
  const [isSyncing, setIsSyncing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

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
    setShowProfileMenu(false);
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navbar */}
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💊</span>
            <div>
              <h1 className="text-lg font-bold leading-none">PharmaPOS</h1>
              <p className="text-xs text-blue-200">Pharmacy Inventory & POS System</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Sync status */}
            {pendingSyncCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-100 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>{pendingSyncCount} pending</span>
              </div>
            )}

            {/* User menu */}
            {user && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden sm:block text-sm">{user.username}</span>
                    <span className="text-xs bg-blue-600/50 px-1.5 py-0.5 rounded text-blue-200 capitalize">{user.role}</span>
                  </button>

                  {showProfileMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border overflow-hidden z-50">
                      <div className="px-4 py-3 border-b">
                        <p className="font-medium text-gray-900">{user.username}</p>
                        <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                      </div>

                      <div className="py-1">
                        <button
                          onClick={() => { setShowChangePassword(true); setShowProfileMenu(false); }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Change Password
                        </button>
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Logout
                        </button>
                      </div>

                    </div>
                  )}
                </div>
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

      {/* Tab navigation */}
      {visibleTabs.length > 1 && (
        <nav className="border-b bg-white">
          <div className="max-w-screen-xl mx-auto px-4">
            <div className="flex gap-1 -mb-px">
              {visibleTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-1.5"><tab.Icon size={16} /></span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

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

      {/* API Settings Modal */}
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        user={user}
      />

      {/* Click outside to close profile menu */}
      {showProfileMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
      )}
    </div>

  );
}