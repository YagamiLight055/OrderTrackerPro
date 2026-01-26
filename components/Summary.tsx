
import React, { useState, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { SummaryRow } from '../types';

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const Summary: React.FC = () => {
  const [filterCity, setFilterCity] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const orders = useLiveQuery(() => db.orders.toArray());

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const cityMatch = !filterCity || o.city.trim() === filterCity;
      const customerMatch = !filterCustomer || o.customer.trim() === filterCustomer;
      const materialMatch = !filterMaterial || o.material.trim() === filterMaterial;
      const statusMatch = !filterStatus || o.status === filterStatus;
      
      const orderDate = new Date(o.createdAt).setHours(0,0,0,0);
      const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
      const end = endDate ? new Date(endDate).setHours(23,59,59,999) : null;
      
      const matchesStart = !start || orderDate >= start;
      const matchesEnd = !end || orderDate <= end;

      return cityMatch && customerMatch && materialMatch && statusMatch && matchesStart && matchesEnd;
    });
  }, [orders, filterCity, filterCustomer, filterMaterial, filterStatus, startDate, endDate]);

  const summaryData = useMemo(() => {
    const groups: Record<string, SummaryRow> = {};

    filteredOrders.forEach(o => {
      const key = `${o.city.trim()}|${o.customer.trim()}|${o.material.trim()}`;
      if (!groups[key]) {
        groups[key] = {
          city: o.city.trim(),
          customer: o.customer.trim(),
          material: o.material.trim(),
          orderCount: 0,
          totalQty: 0
        };
      }
      groups[key].orderCount += 1;
      groups[key].totalQty += o.qty;
    });

    return Object.values(groups).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredOrders]);

  const stats = useMemo(() => {
    return {
      totalOrders: filteredOrders.length,
      totalQty: filteredOrders.reduce((sum, o) => sum + o.qty, 0),
      uniqueCustomers: new Set(filteredOrders.map(o => o.customer.trim())).size
    };
  }, [filteredOrders]);

  const cities = useMemo(() => 
    Array.from(new Set((orders || []).map(o => o.city.trim()))).sort() as string[], 
    [orders]
  );
  const customers = useMemo(() => 
    Array.from(new Set((orders || []).map(o => o.customer.trim()))).sort() as string[], 
    [orders]
  );
  const materials = useMemo(() => 
    Array.from(new Set((orders || []).map(o => o.material.trim()))).sort() as string[], 
    [orders]
  );

  const hasActiveFilters = filterCity || filterCustomer || filterMaterial || filterStatus || startDate || endDate;

  const clearFilters = () => {
    setFilterCity('');
    setFilterCustomer('');
    setFilterMaterial('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
  };

  if (!orders) return <div className="p-12 text-center text-gray-400 font-bold">Aggregating data...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 group hover:border-indigo-100 transition-colors">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Entries Found</p>
          <p className="text-3xl font-black text-indigo-600 transition-all group-hover:scale-105 origin-left">{stats.totalOrders}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 group hover:border-indigo-100 transition-colors">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Accumulated Qty</p>
          <p className="text-3xl font-black text-indigo-600 transition-all group-hover:scale-105 origin-left">{stats.totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 group hover:border-indigo-100 transition-colors">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Filtered Clients</p>
          <p className="text-3xl font-black text-indigo-600 transition-all group-hover:scale-105 origin-left">{stats.uniqueCustomers}</p>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-4">
        <div className="flex items-center justify-between mb-2">
           <h2 className="text-xl font-black text-gray-900 tracking-tight">Analysis Filters</h2>
           {hasActiveFilters && (
             <button 
               onClick={clearFilters}
               className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline decoration-2 underline-offset-4"
             >
               Reset All Filters
             </button>
           )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Customer</label>
             <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Customers</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Status</label>
             <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Location</label>
             <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Material</label>
             <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Materials</option>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">From</label>
             <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">To</label>
             <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Consolidated View</h2>
          <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full uppercase tracking-widest">
            {summaryData.length} Groups matched
          </span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Location</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Customer</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Material</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Orders</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-gray-300 font-bold italic">No matching groups found.</td>
                </tr>
              ) : (
                summaryData.map((row, idx) => (
                  <tr key={idx} className="group hover:bg-indigo-50/50 transition-colors">
                    <td className="py-4 px-2 text-sm font-bold text-gray-500">{row.city}</td>
                    <td className="py-4 px-2 text-sm font-black text-gray-900">{row.customer}</td>
                    <td className="py-4 px-2 text-sm text-center">
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">{row.material}</span>
                    </td>
                    <td className="py-4 px-2 text-sm text-center font-bold text-gray-400">{row.orderCount}</td>
                    <td className="py-4 px-2 text-sm text-right font-black text-indigo-600">{row.totalQty.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            {summaryData.length > 0 && (
              <tfoot className="border-t-2 border-indigo-100">
                <tr className="bg-indigo-50/30">
                  <td colSpan={3} className="py-4 px-4 text-xs font-black text-indigo-400 uppercase tracking-widest text-right">Filtered Totals</td>
                  <td className="py-4 px-2 text-sm text-center font-black text-indigo-900">{summaryData.reduce((acc, curr) => acc + curr.orderCount, 0)}</td>
                  <td className="py-4 px-2 text-lg text-right font-black text-indigo-700">{summaryData.reduce((acc, curr) => acc + curr.totalQty, 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default Summary;
