
import React, { useState, useEffect } from 'react';
import { AppTab, StorageMode } from './types';
import AddOrder from './components/AddOrder';
import OrdersList from './components/OrdersList';
import Summary from './components/Summary';
import Backup from './components/Backup';
import MasterData from './components/MasterData';
import { getSyncConfig } from './services/syncService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.ADD_ORDER);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>(() => {
    const saved = localStorage.getItem('app_storage_mode');
    return (saved as StorageMode) || StorageMode.OFFLINE;
  });

  useEffect(() => {
    localStorage.setItem('app_storage_mode', storageMode);
  }, [storageMode]);

  const toggleMode = () => {
    if (storageMode === StorageMode.OFFLINE) {
      const config = getSyncConfig();
      if (!config) {
        alert("Configuration Required: Please set up your Supabase project in the 'Cloud' tab to enable Online mode.");
        setActiveTab(AppTab.BACKUP);
        return;
      }
      setStorageMode(StorageMode.ONLINE);
    } else {
      setStorageMode(StorageMode.OFFLINE);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.ADD_ORDER:
        return <AddOrder 
          mode={storageMode}
          editId={editingOrderId} 
          onSuccess={() => {
            setEditingOrderId(null);
            setActiveTab(AppTab.ORDERS_LIST);
          }} 
          onCancel={() => {
            setEditingOrderId(null);
            setActiveTab(AppTab.ORDERS_LIST);
          }}
        />;
      case AppTab.ORDERS_LIST:
        return <OrdersList 
          mode={storageMode}
          onEdit={(id) => {
            setEditingOrderId(id);
            setActiveTab(AppTab.ADD_ORDER);
          }} 
        />;
      case AppTab.SUMMARY:
        return <Summary mode={storageMode} />;
      case AppTab.MASTER_DATA:
        return <MasterData mode={storageMode} />;
      case AppTab.BACKUP:
        return <Backup />;
      default:
        return <AddOrder 
          mode={storageMode}
          onSuccess={() => setActiveTab(AppTab.ORDERS_LIST)} 
          onCancel={() => setActiveTab(AppTab.ORDERS_LIST)} 
        />;
    }
  };

  const navItems = [
    { id: AppTab.ADD_ORDER, label: 'Add Order', icon: <PlusIcon className="w-6 h-6" /> },
    { id: AppTab.ORDERS_LIST, label: 'History', icon: <ListBulletIcon className="w-6 h-6" /> },
    { id: AppTab.SUMMARY, label: 'Stats', icon: <ChartBarIcon className="w-6 h-6" /> },
    { id: AppTab.MASTER_DATA, label: 'Manage', icon: <Cog6ToothIcon className="w-6 h-6" /> },
    { id: AppTab.BACKUP, label: 'Cloud', icon: <CloudArrowUpIcon className="w-6 h-6" /> },
  ];

  return (
    <div className={`flex flex-col min-h-screen transition-colors duration-500 ${storageMode === StorageMode.ONLINE ? 'bg-[#F0F7FF]' : 'bg-[#F8FAFC]'}`}>
      <header className="bg-white/95 border-b border-gray-100 px-4 md:px-6 py-3.5 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className={`w-10 h-10 md:w-11 md:h-11 shadow-2xl rounded-2xl flex items-center justify-center transition-all duration-500 transform hover:scale-105 ${storageMode === StorageMode.ONLINE ? 'bg-blue-600 shadow-blue-200' : 'bg-indigo-600 shadow-indigo-200'}`}>
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full p-2">
                  <path d="M30 40 L50 30 L70 40 L50 50 Z" fill="#fff" />
                  <path d="M30 40 V60 L50 70 V50 Z" fill="#e0e7ff" />
                  <path d="M70 40 V60 L50 70 V50 Z" fill="#c7d2fe" />
                  <circle cx="72" cy="72" r="18" fill="#fff" />
                  <path d="M64 72 L70 78 L80 68" fill="none" stroke={storageMode === StorageMode.ONLINE ? '#2563eb' : '#4f46e5'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
               </svg>
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-lg md:text-xl font-black text-gray-900 tracking-tight leading-[1.1] uppercase">ORDER TRACKER <span className={storageMode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}>PRO</span></h1>
              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 mt-0.5">Advanced Order Tracking System</p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
            <div className="flex items-center bg-gray-100 p-1 rounded-[1.25rem] border border-gray-200 shadow-inner">
               <button 
                 onClick={() => setStorageMode(StorageMode.OFFLINE)}
                 className={`px-3 md:px-5 py-1.5 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${storageMode === StorageMode.OFFLINE ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-500'}`}
               >
                 Offline
               </button>
               <button 
                 onClick={toggleMode}
                 className={`px-3 md:px-5 py-1.5 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${storageMode === StorageMode.ONLINE ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-500'}`}
               >
                 Online
               </button>
            </div>

            <div className="hidden lg:flex gap-1">
               {navItems.map(item => (
                  <button 
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === item.id ? (storageMode === StorageMode.ONLINE ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100') : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                    {item.label}
                  </button>
               ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 p-4 md:p-8 max-w-6xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-6 md:mb-8 flex items-center justify-center">
           <div className={`px-5 py-2 rounded-full border text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-3 shadow-md transition-all ${storageMode === StorageMode.ONLINE ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
              <div className={`w-2 h-2 rounded-full ${storageMode === StorageMode.ONLINE ? 'bg-blue-600 animate-pulse' : 'bg-emerald-500'}`}></div>
              Mode: {storageMode === StorageMode.ONLINE ? 'Online' : 'Offline'}
           </div>
        </div>
        {renderContent()}
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-white/80 backdrop-blur-2xl border border-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-[2.5rem] flex justify-around p-2 z-50 lg:hidden">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              if (item.id !== AppTab.ADD_ORDER) setEditingOrderId(null);
            }}
            className={`flex flex-col items-center justify-center px-3 md:px-4 py-2.5 rounded-3xl transition-all duration-300 ${
              activeTab === item.id 
                ? (storageMode === StorageMode.ONLINE ? 'text-blue-600 bg-blue-50/50 scale-110 shadow-inner' : 'text-indigo-600 bg-indigo-50/50 scale-110 shadow-inner')
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.icon}
            <span className="text-[8px] mt-1.5 font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>;
}
function ListBulletIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
function ChartBarIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
function Cog6ToothIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function CloudArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>;
}
