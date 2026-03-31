
import React, { useState, useEffect, useMemo } from 'react';
import { db, Shipment, Order } from '../db';
import { StorageMode } from '../types';
import { getShipments, saveShipment, deleteShipment } from '../services/shipmentService';
import { getOrders, saveOrder } from '../services/orderService';
import { exportToCSV } from '../services/csvService';
import { 
  ArchiveBoxIcon, 
  PlusIcon, 
  TrashIcon, 
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ChevronRightIcon,
  PrinterIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'motion/react';

interface ArchiveProps {
  mode: StorageMode;
}

const Archive: React.FC<ArchiveProps> = ({ mode }) => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openedShipment, setOpenedShipment] = useState<Shipment | null>(null);
  const [shipmentOrders, setShipmentOrders] = useState<Order[]>([]);

  // New Shipment Form State
  const [selectedOrderUuids, setSelectedOrderUuids] = useState<string[]>([]);
  const [shipmentData, setShipmentData] = useState({
    lrNo: '',
    vehicleNo: '',
    transporter: '',
    invoiceNo: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dispatchDate: new Date().toISOString().split('T')[0],
    note: ''
  });

  useEffect(() => {
    fetchData();
  }, [mode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sData, oData] = await Promise.all([
        getShipments(mode),
        getOrders(mode)
      ]);
      setShipments(sData.sort((a, b) => b.dispatchDate - a.dispatchDate));
      setReadyOrders(oData.filter(o => o.status === 'Ready'));
    } catch (error) {
      console.error("Error fetching archive data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShipment = async () => {
    if (selectedOrderUuids.length === 0) {
      alert("Please select at least one order.");
      return;
    }
    if (!shipmentData.lrNo) {
      alert("LR Number is required.");
      return;
    }

    try {
      const newShipment: Shipment = {
        uuid: crypto.randomUUID(),
        reference: shipmentData.lrNo, // Mirroring lrNo to reference for indexing/compat
        lrNo: shipmentData.lrNo,
        vehicleNo: shipmentData.vehicleNo,
        transporter: shipmentData.transporter,
        invoiceNo: shipmentData.invoiceNo,
        invoiceDate: new Date(shipmentData.invoiceDate).getTime(),
        dispatchDate: new Date(shipmentData.dispatchDate).getTime(),
        orderUuids: selectedOrderUuids,
        attachments: [],
        note: shipmentData.note,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await saveShipment(mode, newShipment);

      // Update order statuses to 'Archived'
      for (const uuid of selectedOrderUuids) {
        const order = readyOrders.find(o => o.uuid === uuid);
        if (order) {
          await saveOrder(mode, { ...order, status: 'Archived', updatedAt: Date.now() });
        }
      }

      setShowCreateModal(false);
      setSelectedOrderUuids([]);
      setShipmentData({
        lrNo: '',
        vehicleNo: '',
        transporter: '',
        invoiceNo: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        dispatchDate: new Date().toISOString().split('T')[0],
        note: ''
      });
      fetchData();
    } catch (error) {
      console.error("Error creating shipment:", error);
      alert("Failed to create shipment.");
    }
  };

  const handleDelete = async (shipment: Shipment) => {
    if (!confirm("Are you sure you want to delete this archive? Linked orders will return to 'Ready' status.")) return;

    try {
      await deleteShipment(mode, shipment.id!, shipment.uuid);
      
      // Revert orders to 'Ready'
      const allOrders = await getOrders(mode);
      for (const uuid of shipment.orderUuids) {
        const order = allOrders.find(o => o.uuid === uuid);
        if (order) {
          await saveOrder(mode, { ...order, status: 'Ready', updatedAt: Date.now() });
        }
      }

      fetchData();
    } catch (error) {
      console.error("Error deleting shipment:", error);
    }
  };

  const openManifest = async (shipment: Shipment) => {
    setOpenedShipment(shipment);
    const allOrders = await getOrders(mode);
    const filtered = allOrders.filter(o => shipment.orderUuids.includes(o.uuid));
    setShipmentOrders(filtered);
  };

  const handleExportArchive = () => {
    if (shipments.length === 0) {
      alert("No archives to export.");
      return;
    }

    const exportData = shipments.map(s => ({
      'Reference': s.lrNo || s.reference,
      'Dispatch Date': new Date(s.dispatchDate).toLocaleDateString(),
      'Invoice Number': s.invoiceNo || '',
      'Invoice Date': s.invoiceDate ? new Date(s.invoiceDate).toLocaleDateString() : '',
      'Vehicle Number': s.vehicleNo || '',
      'Transporter': s.transporter || '',
      'Reference Number (LR)': s.lrNo || '',
      'Order UUIDs': s.orderUuids.join(', '),
      'Notes': s.note || ''
    }));

    exportToCSV(exportData, `Archives_Export_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const filteredShipments = useMemo(() => {
    if (!searchQuery) return shipments;
    const q = searchQuery.toLowerCase();
    return shipments.filter(s => 
      (s.lrNo?.toLowerCase().includes(q)) ||
      (s.reference?.toLowerCase().includes(q)) ||
      (s.vehicleNo?.toLowerCase().includes(q)) ||
      (s.transporter?.toLowerCase().includes(q)) ||
      (s.invoiceNo?.toLowerCase().includes(q))
    );
  }, [shipments, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArchiveBoxIcon className="w-7 h-7 text-indigo-600" />
            Shipment Archives
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track dispatched shipments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportArchive}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md text-sm font-medium"
          >
            <PlusIcon className="w-4 h-4" />
            New Shipment
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by LR No, Vehicle, Transporter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
        />
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredShipments.map((shipment) => (
          <motion.div
            layout
            key={shipment.uuid}
            onClick={() => openManifest(shipment)}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex justify-between items-start mb-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
                  Ref: {shipment.lrNo || shipment.reference}
                </span>
                <span className="text-lg font-bold text-gray-900">
                  {new Date(shipment.dispatchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(shipment); }}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div className="flex flex-col">
                <span className="text-gray-400 text-[10px] uppercase font-semibold">Vehicle</span>
                <span className="text-gray-700 font-medium truncate">{shipment.vehicleNo || 'N/A'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-400 text-[10px] uppercase font-semibold">Orders</span>
                <span className="text-gray-700 font-medium">{shipment.orderUuids.length} Items</span>
              </div>
              <div className="flex flex-col col-span-2">
                <span className="text-gray-400 text-[10px] uppercase font-semibold">Transporter</span>
                <span className="text-gray-700 font-medium truncate">{shipment.transporter || 'N/A'}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-indigo-600 font-medium text-sm">
              <span>View Manifest</span>
              <ChevronRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        ))}

        {filteredShipments.length === 0 && (
          <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <ArchiveBoxIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No archived shipments found</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-indigo-600 font-bold hover:underline"
            >
              Create your first shipment
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-xl font-bold text-gray-900">Create New Shipment</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Shipment Details Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Transport Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number (LR) *</label>
                        <input
                          type="text"
                          value={shipmentData.lrNo}
                          onChange={(e) => setShipmentData({...shipmentData, lrNo: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Enter LR Number"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle No</label>
                          <input
                            type="text"
                            value={shipmentData.vehicleNo}
                            onChange={(e) => setShipmentData({...shipmentData, vehicleNo: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="MH 12 AB 1234"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Transporter</label>
                          <input
                            type="text"
                            value={shipmentData.transporter}
                            onChange={(e) => setShipmentData({...shipmentData, transporter: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Transport Co."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Invoice & Date</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                        <input
                          type="text"
                          value={shipmentData.invoiceNo}
                          onChange={(e) => setShipmentData({...shipmentData, invoiceNo: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="INV-2024-001"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                          <input
                            type="date"
                            value={shipmentData.invoiceDate}
                            onChange={(e) => setShipmentData({...shipmentData, invoiceDate: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
                          <input
                            type="date"
                            value={shipmentData.dispatchDate}
                            onChange={(e) => setShipmentData({...shipmentData, dispatchDate: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Selection */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Select Orders to Archive ({readyOrders.length} Ready)</h3>
                    <div className="text-sm font-medium text-indigo-600">
                      {selectedOrderUuids.length} selected
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="p-3 w-10">
                              <input 
                                type="checkbox" 
                                checked={selectedOrderUuids.length === readyOrders.length && readyOrders.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedOrderUuids(readyOrders.map(o => o.uuid));
                                  else setSelectedOrderUuids([]);
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                            <th className="p-3 font-semibold text-gray-600">Customer</th>
                            <th className="p-3 font-semibold text-gray-600">Order No</th>
                            <th className="p-3 font-semibold text-gray-600">Material</th>
                            <th className="p-3 font-semibold text-gray-600">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {readyOrders.map(order => (
                            <tr 
                              key={order.uuid} 
                              className={`hover:bg-indigo-50/30 transition-colors cursor-pointer ${selectedOrderUuids.includes(order.uuid) ? 'bg-indigo-50/50' : ''}`}
                              onClick={() => {
                                if (selectedOrderUuids.includes(order.uuid)) {
                                  setSelectedOrderUuids(selectedOrderUuids.filter(u => u !== order.uuid));
                                } else {
                                  setSelectedOrderUuids([...selectedOrderUuids, order.uuid]);
                                }
                              }}
                            >
                              <td className="p-3">
                                <input 
                                  type="checkbox" 
                                  checked={selectedOrderUuids.includes(order.uuid)}
                                  onChange={() => {}} // Handled by row click
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="p-3 font-medium text-gray-900">{order["CUSTOMER"]}</td>
                              <td className="p-3 text-gray-600">{order["SALES ORDER"]}</td>
                              <td className="p-3 text-gray-600">{order["MATERIAL"]}</td>
                              <td className="p-3 text-gray-600">{order["ITEM QTY"]}</td>
                            </tr>
                          ))}
                          {readyOrders.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                                No orders are currently in 'Ready' status.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={shipmentData.note}
                    onChange={(e) => setShipmentData({...shipmentData, note: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                    placeholder="Add any additional shipment notes..."
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateShipment}
                  disabled={selectedOrderUuids.length === 0 || !shipmentData.lrNo}
                  className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all"
                >
                  Create Archive
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manifest Detail Modal */}
      <AnimatePresence>
        {openedShipment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <ArchiveBoxIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Shipment Manifest</h2>
                    <p className="text-indigo-100 text-xs font-medium">Ref: {openedShipment.lrNo || openedShipment.reference}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => window.print()}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    title="Print Manifest"
                  >
                    <PrinterIcon className="w-6 h-6" />
                  </button>
                  <button onClick={() => setOpenedShipment(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 print:p-0">
                <div id="printable-manifest" className="space-y-8">
                  {/* Summary Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-gray-50 rounded-3xl p-8 border border-gray-100">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Shipment Info</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Reference Number</span>
                          <span className="font-bold text-gray-900">{openedShipment.lrNo || openedShipment.reference}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Dispatch Date</span>
                          <span className="font-bold text-gray-900">{new Date(openedShipment.dispatchDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Batch / Trip ID</span>
                          <span className="font-bold text-gray-900">{openedShipment.reference}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Transport</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Vehicle No</span>
                          <span className="font-bold text-gray-900">{openedShipment.vehicleNo || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Transporter</span>
                          <span className="font-bold text-gray-900">{openedShipment.transporter || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">LR Number</span>
                          <span className="font-bold text-gray-900">{openedShipment.lrNo || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Invoice</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Invoice No</span>
                          <span className="font-bold text-gray-900">{openedShipment.invoiceNo || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Invoice Date</span>
                          <span className="font-bold text-gray-900">
                            {openedShipment.invoiceDate ? new Date(openedShipment.invoiceDate).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total Orders</span>
                          <span className="font-bold text-indigo-600">{shipmentOrders.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Orders Table */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <ListBulletIcon className="w-5 h-5 text-indigo-600" />
                      Included Orders
                    </h3>
                    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="p-4 font-bold text-gray-600">Customer</th>
                            <th className="p-4 font-bold text-gray-600">Sales Order</th>
                            <th className="p-4 font-bold text-gray-600">Material</th>
                            <th className="p-4 font-bold text-gray-600">City</th>
                            <th className="p-4 font-bold text-gray-600 text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {shipmentOrders.map(order => (
                            <tr key={order.uuid} className="hover:bg-gray-50 transition-colors">
                              <td className="p-4 font-medium text-gray-900">{order["CUSTOMER"]}</td>
                              <td className="p-4 text-gray-600">{order["SALES ORDER"]}</td>
                              <td className="p-4 text-gray-600">
                                <div className="max-w-xs truncate" title={order["Material Description"]}>
                                  {order["MATERIAL"]}
                                </div>
                              </td>
                              <td className="p-4 text-gray-600">{order.customerCity}</td>
                              <td className="p-4 text-gray-900 font-bold text-right">{order["ITEM QTY"]}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                          <tr>
                            <td colSpan={4} className="p-4 text-right text-gray-600">Total Quantity:</td>
                            <td className="p-4 text-right text-indigo-600 text-lg">
                              {shipmentOrders.reduce((sum, o) => sum + (o["ITEM QTY"] || 0), 0)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Notes */}
                  {openedShipment.note && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
                      <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Shipment Notes</h3>
                      <p className="text-amber-900 text-sm leading-relaxed">{openedShipment.note}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <DocumentDuplicateIcon className="w-4 h-4" />
                  <span>UUID: {openedShipment.uuid}</span>
                </div>
                <button
                  onClick={() => setOpenedShipment(null)}
                  className="px-8 py-2 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-lg"
                >
                  Close Manifest
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Helper components for icons
const ListBulletIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const ArchiveBoxIconFilled = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375z" />
    <path fillRule="evenodd" d="M3.087 9l.54 9.17c.108 1.837 1.63 3.255 3.47 3.255h9.705c1.84 0 3.362-1.418 3.47-3.255L20.813 9H3.088zM9 12.75a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
  </svg>
);

export default Archive;
