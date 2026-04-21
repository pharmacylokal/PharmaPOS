import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'pharmapos_user';
const TOKEN_STORAGE_KEY = 'pharmapos_token';

export function getStoredUser() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
}

function storeUser(user) {
  if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

function storeToken(token) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function clearStoredCredentials() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem('pharmapos_offline_sales_queue_v1');
  localStorage.removeItem('pharmapos_offline_inventory_queue_v1');
  localStorage.removeItem('pharmapos_cache_products_v1');
  localStorage.removeItem('pharmapos_cache_batches_v1');
  localStorage.removeItem('pharmapos_sync_id_map_v1');
  localStorage.removeItem('pharmapos_api_url');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(false);

  useEffect(() => { storeUser(user); }, [user]);
  useEffect(() => { storeToken(token); }, [token]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const baseUrl = localStorage.getItem('pharmapos_api_url') || 'https://pharmapos-2.onrender.com';
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');

      setToken(data.token);
      setUser(data.user);
      return data;
    } finally { setLoading(false); }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearStoredCredentials();
  };


  const isAdmin = () => user?.role === 'admin';

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  };

  const getAuthHeader = () => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  };


  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin, hasPermission, getAuthHeader, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
