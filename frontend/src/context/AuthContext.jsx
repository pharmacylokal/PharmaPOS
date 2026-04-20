import React, { createContext, useContext, useState, useEffect } from 'react';

// ============================================================
// AUTH CONTEXT - Global state for authentication
// ============================================================

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = 'pharmapos_user';

// Get stored user from localStorage
export function getStoredUser() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Store user in localStorage
function storeUser(user) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  // Auto-sync user to localStorage
  useEffect(() => {
    storeUser(user);
  }, [user]);

  // Login function
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

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setUser(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    setUser(null);
  };

  // Check if user is admin
  const isAdmin = () => user?.role === 'admin';

  // Get auth header for API requests
  const getAuthHeader = () => {
    if (!user) return {};
    const credentials = btoa(`${user.username}:dummy_password_placeholder`);
    // Note: For Bearer token approach, we would need to change backend
    // Using session-based approach here - credentials validated per request
    return {};
  };

  const value = {
    user,
    login,
    logout,
    isAdmin,
    getAuthHeader,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
