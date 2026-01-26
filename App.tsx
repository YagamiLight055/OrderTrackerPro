
import React, { useState } from 'react';
import { AppTab } from './types';
import AddOrder from './components/AddOrder';
import OrdersList from './components/OrdersList';
import Summary from './components/Summary';
import Backup from './components/Backup';
import MasterData from './components/MasterData';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.ADD_ORDER);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.ADD_ORDER:
        return <AddOrder 
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
          onEdit={(id) => {
            setEditingOrderId(id);
            setActiveTab(AppTab.ADD_ORDER);
          }} 
        />;
      case AppTab.SUMMARY:
        return <Summary />;
      case AppTab.MASTER_DATA:
        return <MasterData />;
      case AppTab.BACKUP:
        return <Backup />;
      default:
        return <AddOrder 
          onSuccess={() => setActiveTab(AppTab.ORDERS_LIST)} 
          onCancel={() => setActiveTab(AppTab.ORDERS_LIST)} 
        />;
    }
  };

  const navItems = [
    { id: AppTab.ADD_ORDER, label: 'Add', icon: <PlusIcon className="w-6 h-6" /> },
    { id: AppTab.ORDERS_LIST, label: 'History', icon: <ListBulletIcon className="w-6 h-6" /> },
    { id: AppTab.SUMMARY, label: 'Stats', icon: <ChartBarIcon className="w-6 h-6" /> },
    { id: AppTab.MASTER_DATA, label: 'Manage', icon: <Cog6ToothIcon className="w-6 h-6" /> },
    { id: AppTab.BACKUP, label: 'Cloud', icon: <CloudArrowUpIcon className="w-6 h-6" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-30 backdrop-blur-md bg-white/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shadow-lg shadow-indigo-100 rounded-xl overflow-hidden bg-indigo-600 flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-full h-full p-1.5">
                  <path d="M30 40 L50 30 L70 40 L50 50 Z" fill="#fff" />
                  <path d="M30 40 V60 L50 70 V50 Z" fill="#e0e7ff" />
                  <path d="M70 40 V60 L50 70 V50 Z" fill="#c7d2fe" />
                  <circle cx="72" cy="72" r="18" fill="#fff" />
                  <path d="M64 72 L70 78 L80 68" fill="none" stroke="#4f46e5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
               </svg>
            </div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">OrderTracker<span className="text-indigo-600">Pro</span></h1>
          </div>
          <div className="hidden md:flex gap-1">
             {navItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {item.label}
                </button>
             ))}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 p-4 md:p-8 max-w-6xl mx-auto w-full animate-in fade-in duration-500">
        {renderContent()}
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-md bg-white/90 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] rounded-3xl flex justify-around p-2 z-40 md:hidden">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              if (item.id !== AppTab.ADD_ORDER) setEditingOrderId(null);
            }}
            className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl transition-all duration-300 ${
              activeTab === item.id 
                ? 'text-indigo-600 bg-indigo-50/50 scale-105' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.icon}
            <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>;
}
function ListBulletIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
function ChartBarIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
function Cog6ToothIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function CloudArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>;
}
