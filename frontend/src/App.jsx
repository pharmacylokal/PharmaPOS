import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';

// Inner component that uses auth context
function AppContent() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');

  // Redirect to POS for cashiers on mount
  useEffect(() => {
    if (!isAdmin() && activeTab !== 'pos') {
      setActiveTab('pos');
    }
  }, [isAdmin, activeTab]);

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

  // Define pages (admins see all, cashiers only see POS)
  const pages = {
    pos: <POS />,
    ...(isAdmin() ? {
      inventory: <Inventory />,
      reports: <Reports />,
    } : {})
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {pages[activeTab] || pages.pos}
      </Layout>
    </>
  );
}

// Root component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
