
import React, { useState } from 'react';
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const allOrders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray());

  if (!allOrders) return <div className="p-12 text-center text-gray-400 font-bold">Loading records...</div>;

  const cities = Array.from(new Set(allOrders.map(o => o.city))).sort();
  const customers = Array.from(new Set(allOrders.map(o => o.customer))).sort();
  const materials = Array.from(new Set(allOrders.map(o => o.material))).sort();

  const filteredOrders = allOrders.filter(o => {
    const matchesSearch = 
      o.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.note && o.note.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCity = !filterCity || o.city === filterCity;
    const matchesCustomer = !filterCustomer || o.customer === filterCustomer;
    const matchesMaterial = !filterMaterial || o.material === filterMaterial;
    const matchesStatus = !filterStatus || o.status === filterStatus;

    return matchesSearch && matchesCity && matchesCustomer && matchesMaterial && matchesStatus;
  });

  const handleDelete = async (id: number) => {
    if (confirm("Permanently delete this record?")) {
      await db.orders.delete(id);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Search & Filters */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl shadow-xl shadow-gray-200/40 border border-white sticky top-[80px] z-20 space-y-4">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="text"
            placeholder="Search records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-medium text-lg"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Customers</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Materials</option>
            {materials.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-black text-gray-900">No Orders Found</h3>
            <p className="text-gray-500 mt-2">Try adjusting your search or filters.</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="group bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 border border-gray-50 transition-all duration-300 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16 transition-colors duration-500 ${order.status === 'Delivered' ? 'bg-green-600' : 'bg-indigo-600'}`}></div>
              
              <div className="relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {order.city}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getStatusColor(order.status || 'Pending')}`}>
                        {order.status || 'Pending'}
                      </span>
                    </div>
                    <h3 className="font-black text-xl text-gray-900 leading-none">{order.customer}</h3>
                  </div>
                  <div className="bg-white shadow-md rounded-2xl p-2 px-3 flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 font-black uppercase">Qty</span>
                    <span className="text-xl font-black text-indigo-600 leading-none">{order.qty}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-xl">
                    {order.material}
                  </span>
                </div>

                {/* Attachments Preview */}
                {order.attachments && order.attachments.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
                    {order.attachments.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewImage(src)}
                        className="flex-shrink-0 w-16 h-16 rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:scale-105 transition-transform"
                      >
                        <img src={src} className="w-full h-full object-cover" alt="attachment" />
                      </button>
                    ))}
                  </div>
                )}

                {order.note && (
                  <div className="bg-yellow-50/50 p-3 rounded-2xl mb-4 text-sm text-yellow-800 italic border-l-4 border-yellow-200">
                    "{order.note}"
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                  <span className="text-xs font-bold text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(order.id!)} className="p-2.5 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(order.id!)} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition">
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
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-6 right-6 text-white p-2 hover:bg-white/10 rounded-full transition">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={previewImage} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-in zoom-in-95 duration-300" alt="Full Preview" />
        </div>
      )}
    </div>
  );
};

export default OrdersList;
