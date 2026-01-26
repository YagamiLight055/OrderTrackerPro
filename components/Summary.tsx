
import React, { useState, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { SummaryRow } from '../types';

const Summary: React.FC = () => {
  const [filterCity, setFilterCity] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const orders = useLiveQuery(() => db.orders.toArray());

  const summaryData = useMemo(() => {
    if (!orders) return [];

    const filtered = orders.filter(o => {
      const cityMatch = !filterCity || o.city === filterCity;
      const materialMatch = !filterMaterial || o.material === filterMaterial;
      const startMatch = !dateRange.start || o.createdAt >= new Date(dateRange.start).getTime();
      const endMatch = !dateRange.end || o.createdAt <= new Date(dateRange.end).getTime() + 86400000;
      return cityMatch && materialMatch && startMatch && endMatch;
    });

    const groups: Record<string, SummaryRow> = {};

    filtered.forEach(o => {
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
  }, [orders, filterCity, filterMaterial, dateRange]);

  const stats = useMemo(() => {
    if (!orders) return { totalOrders: 0, totalQty: 0, uniqueCustomers: 0 };
    return {
      totalOrders: orders.length,
      totalQty: orders.reduce((sum, o) => sum + o.qty, 0),
      uniqueCustomers: new Set(orders.map(o => o.customer)).size
    };
  }, [orders]);

  const cities = useMemo(() => Array.from(new Set((orders || []).map(o => o.city))).sort(), [orders]);
  const materials = useMemo(() => Array.from(new Set((orders || []).map(o => o.material))).sort(), [orders]);

  if (!orders) return <div className="p-12 text-center text-gray-400 font-bold">Aggregating data...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total Entries</p>
          <p className="text-3xl font-black text-indigo-600">{stats.totalOrders}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Accumulated Qty</p>
          <p className="text-3xl font-black text-indigo-600">{stats.totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Unique Clients</p>
          <p className="text-3xl font-black text-indigo-600">{stats.uniqueCustomers}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-200/40 border border-gray-100">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Consolidated View</h2>
          <div className="flex flex-wrap gap-2">
             <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="px-3 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold text-gray-600 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterMaterial}
              onChange={(e) => setFilterMaterial(e.target.value)}
              className="px-3 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold text-gray-600 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Materials</option>
              {materials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
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
                  <td colSpan={3} className="py-4 px-4 text-xs font-black text-indigo-400 uppercase tracking-widest text-right">Totals</td>
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
