import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');

  const pages = {
    pos:       <POS />,
    inventory: <Inventory />,
    reports:   <Reports />,
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {pages[activeTab]}
      </Layout>
    </>
  );
}
