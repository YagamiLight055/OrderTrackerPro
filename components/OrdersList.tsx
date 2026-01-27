import React, { useState, useMemo } from 'react';
import { db, Order } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface Props {
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

const OrdersList: React.FC<Props> = ({ onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [galleryState, setGalleryState] = useState<{ images: string[], index: number } | null>(null);

  // Filter out deleted items from the query itself
  const allOrders = useLiveQuery(() => 
    db.orders
      .filter(o => o.deleted !== 1)
      .reverse()
      .sortBy('createdAt')
  );

  const cities = useMemo(() => Array.from(new Set(allOrders?.map(o => o.city.trim()) || [])).sort() as string[], [allOrders]);
  const customers = useMemo(() => Array.from(new Set(allOrders?.map(o => o.customer.trim()) || [])).sort() as string[], [allOrders]);
  const materials = useMemo(() => Array.from(new Set(allOrders?.map(o => o.material.trim()) || [])).sort() as string[], [allOrders]);

  const filteredOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders.filter(o => {
      const searchStr = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchStr || 
        o.customer.toLowerCase().includes(searchStr) ||
        o.city.toLowerCase().includes(searchStr) ||
        o.material.toLowerCase().includes(searchStr) ||
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
  }, [allOrders, searchTerm, filterCity, filterCustomer, filterMaterial, filterStatus, startDate, endDate]);

  const hasActiveFilters = searchTerm || filterCity || filterCustomer || filterMaterial || filterStatus || startDate || endDate;

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCity('');
    setFilterCustomer('');
    setFilterMaterial('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this record? It will be removed from all synced devices.")) {
      // Use Soft Delete: mark as deleted (1) and update timestamp so sync picks it up
      await db.orders.update(id, { 
        deleted: 1, 
        updatedAt: Date.now() 
      });
    }
  };

  const openGallery = (images: string[], index: number) => {
    setGalleryState({ images, index });
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!galleryState) return;
    setGalleryState(prev => prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!galleryState) return;
    setGalleryState(prev => prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : null);
  };

  if (!allOrders) return <div className="p-12 text-center text-gray-400 font-bold">Waking up database...</div>;

  return (
    <div className="space-y-6">
      {/* Search and Advanced Filters */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 sticky top-[80px] z-20 space-y-5">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="text"
              placeholder="Search history..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900"
            />
          </div>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters} 
              className="px-6 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-sm whitespace-nowrap hover:bg-indigo-100 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Customer</label>
             <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                <option value="">All Clients</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Status</label>
             <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Location</label>
             <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Material</label>
             <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                <option value="">All Materials</option>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">From</label>
             <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">To</label>
             <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-24">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
            <p className="text-gray-300 font-black text-xl italic uppercase tracking-widest">No Matches Found</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 flex flex-col hover:shadow-xl hover:shadow-indigo-100/30 transition-all duration-300 group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                      {order.city}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    {order.attachments && order.attachments.length > 0 && (
                      <span className="bg-gray-900 text-white text-[9px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {order.attachments.length} Photos
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 leading-none">{order.customer}</h3>
                </div>
                <div className="bg-indigo-600 rounded-2xl p-4 min-w-[70px] text-center shadow-lg shadow-indigo-100">
                  <span className="block text-[10px] text-indigo-200 font-black uppercase tracking-tighter">Qty</span>
                  <span className="block text-2xl font-black text-white leading-none mt-1">{order.qty}</span>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Material Details</span>
                <p className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl">{order.material}</p>
              </div>

              {order.attachments && order.attachments.length > 0 && (
                <div className="mb-4">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {order.attachments.map((src, idx) => (
                      <button 
                        key={idx}
                        onClick={() => openGallery(order.attachments!, idx)}
                        className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-sm flex-shrink-0 group/img hover:scale-105 transition-transform"
                      >
                        <img src={src} className="w-full h-full object-cover" alt="attachment" loading="lazy" />
                        <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {order.note && (
                <div className="bg-amber-50/50 p-3 rounded-2xl text-xs font-medium text-amber-900 mb-4 border border-amber-100 italic">
                  "{order.note}"
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                  {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => onEdit(order.id!)} className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(order.id!)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
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
           <button 
             onClick={() => setGalleryState(null)}
             className="absolute top-6 right-6 p-4 text-white/50 hover:text-white transition-colors"
           >
             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>

           <div className="relative w-full max-w-4xl flex items-center group" onClick={e => e.stopPropagation()}>
              {galleryState.images.length > 1 && (
                <>
                  <button onClick={prevImage} className="absolute left-0 md:-left-20 p-4 text-white/30 hover:text-white transition-all bg-white/5 rounded-full backdrop-blur z-10">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button onClick={nextImage} className="absolute right-0 md:-right-20 p-4 text-white/30 hover:text-white transition-all bg-white/5 rounded-full backdrop-blur z-10">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </>
              )}
              
              <div className="w-full flex flex-col items-center gap-6">
                <img 
                  src={galleryState.images[galleryState.index]} 
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border-4 border-white/5 ring-1 ring-white/10" 
                  alt="Proof Full Size" 
                />
                <div className="flex flex-col items-center gap-2">
                   <div className="px-6 py-2 bg-white/10 backdrop-blur-xl rounded-full border border-white/20 text-white font-black text-sm uppercase tracking-widest shadow-xl">
                    Photo {galleryState.index + 1} of {galleryState.images.length}
                   </div>
                   <p className="text-white/40 text-[10px] font-bold uppercase">Click outside to dismiss</p>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;