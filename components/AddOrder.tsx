
import React, { useState, useEffect, useRef } from 'react';
import { db, Order } from '../db';
import AutocompleteInput from './AutocompleteInput';

interface Props {
  editId?: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const AddOrder: React.FC<Props> = ({ editId, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<{
    customer: string;
    city: string;
    material: string;
    qty: number;
    status: string;
    note: string;
    attachments: string[];
    createdAt?: number;
  }>({
    customer: '',
    city: '',
    material: '',
    qty: 0,
    status: 'Pending',
    note: '',
    attachments: []
  });

  const [options, setOptions] = useState<{ customers: string[], cities: string[], materials: string[] }>({
    customers: [],
    cities: [],
    materials: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadOptions = async () => {
      const orders = await db.orders.toArray();
      const masterCustomers = await db.customersMaster.toArray();
      const masterCities = await db.citiesMaster.toArray();
      const masterMaterials = await db.materialsMaster.toArray();

      const distinct = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(s => s.trim()))).sort();
      
      setOptions({
        customers: distinct([...orders.map(o => o.customer), ...masterCustomers.map(c => c.name)]),
        cities: distinct([...orders.map(o => o.city), ...masterCities.map(c => c.name)]),
        materials: distinct([...orders.map(o => o.material), ...masterMaterials.map(m => m.name)]),
      });
    };
    loadOptions();

    if (editId) {
      db.orders.get(editId).then(order => {
        if (order) {
          setFormData({
            customer: order.customer,
            city: order.city,
            material: order.material,
            qty: order.qty,
            status: order.status || 'Pending',
            note: order.note || '',
            attachments: order.attachments || [],
            createdAt: order.createdAt
          });
        }
      });
    }
  }, [editId]);

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const newAttachments = await Promise.all(
        Array.from(files).map(file => readFileAsDataURL(file))
      );
      
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newAttachments]
      }));
    } catch (err) {
      console.error("Error reading files:", err);
      alert("Failed to read one or more images. Please try again.");
    } finally {
      // Clear the input value so the same file can be selected again if needed
      if (e.target) e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { customer, city, material, qty, status, note, attachments, createdAt } = formData;
    
    if (!customer.trim() || !city.trim() || !material.trim() || qty <= 0) {
      alert("Please fill all required fields correctly.");
      return;
    }

    const orderData: Order = {
      customer: customer.trim(),
      city: city.trim(),
      material: material.trim(),
      qty: Number(qty),
      status: status,
      note: note.trim(),
      attachments,
      createdAt: editId && createdAt ? createdAt : Date.now()
    };

    try {
      if (editId) {
        await db.orders.update(editId, orderData as any);
      } else {
        await db.orders.add(orderData);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Failed to save order.");
    }
  };

  const clearForm = () => {
    setFormData({
      customer: '',
      city: '',
      material: '',
      qty: 0,
      status: 'Pending',
      note: '',
      attachments: []
    });
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
        <header className="mb-8">
          <h2 className="text-3xl font-black text-gray-900 leading-tight">
            {editId ? 'Modify Record' : 'Create Entry'}
          </h2>
          <p className="text-gray-500 font-medium">Capture order details and loading proof.</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <AutocompleteInput
            label="Customer Name"
            value={formData.customer}
            onChange={(val) => setFormData({ ...formData, customer: val })}
            options={options.customers}
            placeholder="e.g. Acme Corp"
            required
          />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AutocompleteInput
              label="City / Destination"
              value={formData.city}
              onChange={(val) => setFormData({ ...formData, city: val })}
              options={options.cities}
              placeholder="e.g. New York"
              required
            />
            <div className="relative">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Quantity</label>
              <input
                type="number"
                value={formData.qty || ''}
                onChange={(e) => setFormData({ ...formData, qty: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-lg"
                required
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AutocompleteInput
              label="Material Description"
              value={formData.material}
              onChange={(val) => setFormData({ ...formData, material: val })}
              options={options.materials}
              placeholder="e.g. Steel Pipes"
              required
            />
            <div className="relative">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Order Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900 appearance-none"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Proof of Loading / Vehicle Images</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {formData.attachments.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-gray-100 shadow-sm">
                  <img src={src} className="w-full h-full object-cover" alt="attachment" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50 transition-all group"
              >
                <svg className="w-8 h-8 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="text-[10px] font-black uppercase">Add Photo</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*"
              multiple
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Additional Notes</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner min-h-[100px]"
              placeholder="Any extra details..."
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <button
              type="submit"
              className="flex-[2] bg-indigo-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 text-lg"
            >
              {editId ? 'Save Changes' : 'Confirm Entry'}
            </button>
            <button
              type="button"
              onClick={editId ? onCancel : clearForm}
              className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 transition font-bold"
            >
              {editId ? 'Cancel' : 'Reset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrder;
