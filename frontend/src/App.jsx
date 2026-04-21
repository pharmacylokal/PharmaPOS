import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Users from './pages/Users';

// Inner component that uses auth context
function AppContent() {
  const { user, isAdmin, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');

  // Define pages based on permissions
  const pages = {
    pos: <POS />,
    ...(hasPermission('inventory_view') ? { inventory: <Inventory /> } : {}),
    ...(hasPermission('reports_access') ? { reports: <Reports /> } : {}),
    ...(hasPermission('users_view') ? { users: <Users /> } : {}),
  };

  // Redirect to first available tab if current tab is not accessible
  useEffect(() => {
    const availableTabs = Object.keys(pages);
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] || 'pos');
    }
  }, [activeTab, pages]);

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

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