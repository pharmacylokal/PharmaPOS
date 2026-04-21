import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'pharmapos_user';
const PASSWORD_STORAGE_KEY = 'pharmapos_password';

export function getStoredUser() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function storeUser(user) {
  if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

function storePassword(password) {
  if (password) localStorage.setItem(PASSWORD_STORAGE_KEY, password);
  else localStorage.removeItem(PASSWORD_STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  useEffect(() => { storeUser(user); }, [user]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const baseUrl = localStorage.getItem('pharmapos_api_url') || 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      setUser(data);
      storePassword(password);
      return data;
    } finally { setLoading(false); }
  };

  const logout = () => { setUser(null); storePassword(null); };

  const isAdmin = () => user?.role === 'admin';

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  };

  const getAuthHeader = () => {
    if (!user) return {};
    const storedPass = localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (!storedPass) return {};
    return { Authorization: 'Basic ' + btoa(`${user.username}:${storedPass}`) };
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, hasPermission, getAuthHeader, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}