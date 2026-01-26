
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const allOrders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray());

  // Derived filter options
  const cities = useMemo(() => 
    Array.from(new Set(allOrders?.map(o => o.city.trim()) || [])).sort(), 
    [allOrders]
  );
  const customers = useMemo(() => 
    Array.from(new Set(allOrders?.map(o => o.customer.trim()) || [])).sort(), 
    [allOrders]
  );
  const materials = useMemo(() => 
    Array.from(new Set(allOrders?.map(o => o.material.trim()) || [])).sort(), 
    [allOrders]
  );

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
    if (confirm("Permanently delete this record?")) {
      await db.orders.delete(id);
    }
  };

  if (!allOrders) return <div className="p-12 text-center text-gray-400 font-bold">Loading records...</div>;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Search & Filters Panel */}
      <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 sticky top-[80px] z-20 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="text"
              placeholder="Search by customer, city, or note..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900"
            />
          </div>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="px-6 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-sm hover:bg-indigo-100 transition whitespace-nowrap"
            >
              Clear All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Customer</label>
             <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Customers</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Status</label>
             <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Location</label>
             <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Material</label>
             <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Materials</option>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">From Date</label>
             <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">To Date</label>
             <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
           <p className="text-[10px] font-black text-gray-400 uppercase">
             Showing <span className="text-indigo-600">{filteredOrders.length}</span> of {allOrders.length} entries
           </p>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-gray-200">
            <div className="text-6xl mb-4 opacity-20">🔎</div>
            <h3 className="text-xl font-black text-gray-900">No matching orders</h3>
            <p className="text-gray-500 mt-2 font-medium">Try broadening your search or clearing filters.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-6 text-indigo-600 font-black hover:underline decoration-2 underline-offset-4">Reset all filters</button>
            )}
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="group bg-white p-6 rounded-[2rem] shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 border border-gray-50 transition-all duration-500 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-32 h-32 opacity-[0.03] rounded-full -mr-16 -mt-16 transition-colors duration-500 ${order.status === 'Delivered' ? 'bg-green-600' : 'bg-indigo-600'}`}></div>
              
              <div className="relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {order.city}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getStatusColor(order.status || 'Pending')}`}>
                        {order.status || 'Pending'}
                      </span>
                    </div>
                    <h3 className="font-black text-2xl text-gray-900 leading-none tracking-tight">{order.customer}</h3>
                  </div>
                  <div className="bg-white shadow-xl shadow-gray-100 rounded-2xl p-2 px-4 flex flex-col items-center border border-gray-50">
                    <span className="text-[10px] text-gray-400 font-black uppercase">Qty</span>
                    <span className="text-2xl font-black text-indigo-600 leading-none">{order.qty}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl">
                    {order.material}
                  </span>
                </div>

                {/* Attachments Preview */}
                {order.attachments && order.attachments.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-2 mb-5 scrollbar-hide">
                    {order.attachments.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewImage(src)}
                        className="flex-shrink-0 w-20 h-20 rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:scale-105 transition-transform bg-gray-50"
                      >
                        <img src={src} className="w-full h-full object-cover" alt="attachment" />
                      </button>
                    ))}
                  </div>
                )}

                {order.note && (
                  <div className="bg-amber-50/50 p-4 rounded-2xl mb-5 text-sm text-amber-900 font-medium italic border-l-4 border-amber-200">
                    "{order.note}"
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-300 uppercase">Created On</span>
                    <span className="text-xs font-bold text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(order.id!)} className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all active:scale-90">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(order.id!)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all active:scale-90">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-8 right-8 text-white p-3 hover:bg-white/10 rounded-full transition-all scale-125">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={previewImage} className="max-w-full max-h-[90vh] rounded-3xl shadow-2xl object-contain animate-in zoom-in-95 duration-500 border border-white/10" alt="Full Preview" />
        </div>
      )}
    </div>
  );
};

export default OrdersList;
