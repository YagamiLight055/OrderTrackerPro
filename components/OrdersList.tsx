
import React, { useState, useMemo, useEffect } from 'react';
import { db, Order } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StorageMode } from '../types';
import { getOrders, deleteOrder } from '../services/orderService';
import { initSupabase } from '../services/syncService';

interface Props {
  mode: StorageMode;
  onEdit: (id: number) => void;
}

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-yellow-50 text-yellow-600 border-yellow-100';
    case 'Processing': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'Shipped': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    case 'Delivered': return 'bg-green-50 text-green-600 border-green-100';
    case 'Cancelled': return 'bg-red-50 text-red-600 border-red-100';
    default: return 'bg-gray-50 text-gray-600 border-gray-100';
  }
};

const OrdersList: React.FC<Props> = ({ mode, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  
  const [onlineOrders, setOnlineOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [galleryState, setGalleryState] = useState<{ images: string[], index: number } | null>(null);

  const localOrders = useLiveQuery(() => 
    db.orders.reverse().sortBy('createdAt')
  );

  const fetchOnline = async () => {
    if (mode !== StorageMode.ONLINE) return;
    setIsLoading(true);
    try {
      const data = await getOrders(StorageMode.ONLINE);
      setOnlineOrders(data);
    } catch (err) {
      console.error("Fetch Online Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === StorageMode.ONLINE) {
      fetchOnline();
      
      const supabase = initSupabase();
      if (!supabase) return;

      const channel = supabase
        .channel('public:orders_realtime')
        .on(
          'postgres_changes',
          { event: '*', table: 'orders', schema: 'public' },
          () => fetchOnline()
        )
        .subscribe((status) => {
          setIsRealtimeActive(status === 'SUBSCRIBED');
        });

      return () => {
        supabase.removeChannel(channel);
        setIsRealtimeActive(false);
      };
    } else {
      setOnlineOrders([]);
      setIsRealtimeActive(false);
    }
  }, [mode]);

  const activeOrders = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;

  const cities = useMemo(() => Array.from(new Set(activeOrders.map(o => o.city.trim()))).sort() as string[], [activeOrders]);
  const customers = useMemo(() => Array.from(new Set(activeOrders.map(o => o.customer.trim()))).sort() as string[], [activeOrders]);
  const materials = useMemo(() => Array.from(new Set(activeOrders.map(o => o.material.trim()))).sort() as string[], [activeOrders]);

  const filteredOrders = useMemo(() => {
    return activeOrders.filter(o => {
      const searchStr = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchStr || 
        o.customer.toLowerCase().includes(searchStr) ||
        o.city.toLowerCase().includes(searchStr) ||
        o.material.toLowerCase().includes(searchStr) ||
        (o.lrNo && o.lrNo.toLowerCase().includes(searchStr)) ||
        (o.vehicleNo && o.vehicleNo.toLowerCase().includes(searchStr)) ||
        (o.note && o.note.toLowerCase().includes(searchStr));
      
      const matchesCity = !filterCity || o.city.trim() === filterCity;
      const matchesCustomer = !filterCustomer || o.customer.trim() === filterCustomer;
      const matchesMaterial = !filterMaterial || o.material.trim() === filterMaterial;
      const matchesStatus = !filterStatus || o.status === filterStatus;
      
      const orderDate = new Date(o.createdAt).setHours(0,0,0,0);
      const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
      const end = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

      const matchesStart = !start || orderDate >= start;
      const matchesEnd = !end || orderDate <= end;

      return matchesSearch && matchesCity && matchesCustomer && matchesMaterial && matchesStatus && matchesStart && matchesEnd;
    });
  }, [activeOrders, searchTerm, filterCity, filterCustomer, filterMaterial, filterStatus, startDate, endDate]);

  const hasActiveFilters = filterCity || filterCustomer || filterMaterial || filterStatus || startDate || endDate;

  const handleDelete = async (order: Order) => {
    if (confirm(`Delete record for ${order.customer}?`)) {
      try {
        await deleteOrder(mode, order.id!, order.uuid);
        if (mode === StorageMode.ONLINE) fetchOnline(); 
      } catch (err: any) {
        alert("Delete failed: " + err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      {mode === StorageMode.ONLINE && (
        <div className="flex justify-center -mt-2">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isRealtimeActive ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isRealtimeActive ? 'bg-blue-600 animate-pulse' : 'bg-red-500'}`}></div>
              {isRealtimeActive ? 'Live Supabase Connection' : 'Realtime Disconnected'}
           </div>
        </div>
      )}

      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 sticky top-[80px] z-30 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="text"
              placeholder={`Search by Customer, LR or Vehicle...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`flex-1 md:flex-none px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${isFilterExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${isFilterExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
              Filters {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
            </button>
            {mode === StorageMode.ONLINE && (
              <button 
                onClick={fetchOnline}
                disabled={isLoading}
                className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100"
              >
                <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            )}
            {(hasActiveFilters || searchTerm) && (
              <button 
                onClick={() => { setSearchTerm(''); setFilterCity(''); setFilterCustomer(''); setFilterMaterial(''); setFilterStatus(''); setStartDate(''); setEndDate(''); }} 
                className="p-3.5 bg-gray-50 text-gray-400 rounded-2xl hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-100"
                title="Reset All"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-gray-50 animate-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Customer</label>
               <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Clients</option>
                  {customers.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Status</label>
               <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Location</label>
               <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Material</label>
               <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Materials</option>
                  {materials.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">From</label>
               <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none" />
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">To</label>
               <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-24">
        {isLoading && onlineOrders.length === 0 ? (
           <div className="col-span-full py-24 text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-blue-600 font-black uppercase tracking-widest text-sm">Accessing Cloud Storage...</p>
           </div>
        ) : filteredOrders.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
            <p className="text-gray-300 font-black text-xl italic uppercase tracking-widest">No Matches Found</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.uuid} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 flex flex-col hover:shadow-2xl hover:shadow-indigo-100/40 transition-all duration-500 group relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                      {order.city}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    {order.lrNo && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100">
                        LR: {order.lrNo}
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 leading-none">{order.customer}</h3>
                </div>
                <div className={`${mode === StorageMode.ONLINE ? 'bg-blue-600' : 'bg-indigo-600'} rounded-2xl p-4 min-w-[70px] text-center shadow-lg transform group-hover:scale-110 transition-transform duration-500`}>
                  <span className="block text-[10px] opacity-70 text-white font-black uppercase tracking-tighter">Qty</span>
                  <span className="block text-2xl font-black text-white leading-none mt-1">{order.qty}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                 <div className="col-span-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Material Details</span>
                    <p className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-2xl">{order.material}</p>
                 </div>
                 {order.vehicleNo && (
                   <div>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Vehicle</span>
                      <p className="text-xs font-black text-indigo-600 truncate">{order.vehicleNo}</p>
                   </div>
                 )}
                 {order.invoiceNo && (
                   <div>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Invoice</span>
                      <p className="text-xs font-black text-blue-600 truncate">{order.invoiceNo}</p>
                   </div>
                 )}
              </div>

              {order.note && (
                <div className="mb-5">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Operational Note
                  </span>
                  <p className="text-sm font-medium text-gray-600 bg-indigo-50/30 border border-indigo-100/50 px-4 py-2.5 rounded-2xl italic">
                    {order.note}
                  </p>
                </div>
              )}

              {order.attachments && order.attachments.length > 0 && (
                <div className="mb-5">
                  <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
                    {order.attachments.map((src, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setGalleryState({ images: order.attachments!, index: idx })}
                        className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-md flex-shrink-0 group/img hover:scale-105 transition-all"
                      >
                        <img src={src} className="w-full h-full object-cover" alt="attachment" loading="lazy" />
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                           <svg className="w-6 h-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => onEdit(order.id!)} className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm hover:shadow-indigo-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(order)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-red-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {galleryState && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setGalleryState(null)}>
           <div className="relative w-full max-w-4xl flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
              <img src={galleryState.images[galleryState.index]} className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" alt="Proof" />
              <div className="flex gap-4">
                <button 
                  onClick={() => setGalleryState({ ...galleryState, index: (galleryState.index - 1 + galleryState.images.length) % galleryState.images.length })}
                  className="p-4 bg-white/10 text-white rounded-full border border-white/20 hover:bg-white/20 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={() => setGalleryState(null)} className="px-10 py-4 bg-white text-gray-900 rounded-full font-black uppercase tracking-widest text-xs hover:bg-gray-100 transition-all">Close Viewer</button>
                <button 
                  onClick={() => setGalleryState({ ...galleryState, index: (galleryState.index + 1) % galleryState.images.length })}
                  className="p-4 bg-white/10 text-white rounded-full border border-white/20 hover:bg-white/20 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;
