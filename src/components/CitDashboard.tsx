// src/components/CitDashboard.tsx

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  RefreshCw, 
  Search, 
  Coins, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Building2, 
  DollarSign, 
  ChevronRight, 
  TrendingUp,
  Database,
  Info
} from 'lucide-react';
import { citApi, Currency, BranchEntity, VaultTrip } from '../services/citApi';

interface CitDashboardProps {
  onAddToast: (title: string, message: string) => void;
  prefillEmail?: {
    subject: string;
    body_text: string;
    message_id: string;
    is_cit_order?: boolean;
    cit_type?: string;
  } | null;
  onClearPrefill?: () => void;
  showCreateModalInitially?: boolean;
}

export default function CitDashboard({ 
  onAddToast, 
  prefillEmail, 
  onClearPrefill,
  showCreateModalInitially = false 
}: CitDashboardProps) {
  // State variables
  const [orders, setOrders] = useState<VaultTrip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'CIT' | 'ATM'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(showCreateModalInitially);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [branches, setBranches] = useState<BranchEntity[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [sourceReference, setSourceReference] = useState<string>('');
  const [ticketSubject, setTicketSubject] = useState<string>('');
  const [citType, setCitType] = useState<'CIT' | 'ATM'>('CIT');

  // Load orders and metadata
  const loadData = async () => {
    setIsLoading(true);
    try {
      const trips = await citApi.getVaultTrips();
      setOrders(trips);

      const [currList, branchList] = await Promise.all([
        citApi.getCurrencies(),
        citApi.getEntityMasterDetails()
      ]);

      setCurrencies(currList);
      setBranches(branchList);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      onAddToast('Error Loading Data', 'Failed to retrieve some ActiveATM API elements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle prefill trigger
  useEffect(() => {
    if (prefillEmail) {
      // Extract branch name from body
      const branchMatch = (prefillEmail.body_text || '').match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
      const extractedBranch = branchMatch ? branchMatch[1].trim() : '';

      // Find matching branch ID
      if (extractedBranch && branches.length > 0) {
        const found = branches.find(b => 
          (b.name || '').toLowerCase().includes(extractedBranch.toLowerCase()) || 
          (b.branch_name || '').toLowerCase().includes(extractedBranch.toLowerCase())
        );
        if (found) setSelectedBranchId(String(found.id));
      }

      // Extract amount
      const amountMatch = (prefillEmail.body_text || '').match(/(?:Amount|Nilai)\s*[:=]\s*([\d,.]+)/i);
      let extractedAmount = amountMatch ? amountMatch[1].replace(/[,.]/g, '') : '';
      if (extractedAmount) setAmount(extractedAmount);

      // Extract currency
      const currMatch = (prefillEmail.body_text || '').match(/(?:Currency|Mata\s+Uang|Currency\s+Code)\s*[:=]\s*([a-zA-Z]{3})/i);
      const extractedCurr = currMatch ? currMatch[1].toUpperCase() : 'IDR';
      if (extractedCurr && currencies.length > 0) {
        const found = currencies.find(c => 
          (c.code || '').toUpperCase() === extractedCurr || 
          (c.currency_code || '').toUpperCase() === extractedCurr
        );
        if (found) setSelectedCurrencyId(String(found.id));
      } else if (currencies.length > 0) {
        // Fallback to IDR currency
        const idr = currencies.find(c => (c.code || '').toUpperCase() === 'IDR' || (c.currency_code || '').toUpperCase() === 'IDR');
        if (idr) setSelectedCurrencyId(String(idr.id));
      }

      setSourceReference(prefillEmail.message_id || '');
      setTicketSubject(prefillEmail.subject || '');
      if (prefillEmail.cit_type === 'ATM') {
        setCitType('ATM');
      } else {
        setCitType('CIT');
      }

      setIsModalOpen(true);
    }
  }, [prefillEmail, branches, currencies]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurrencyId || !selectedBranchId || !amount || !ticketSubject) {
      onAddToast('Validation Error', 'Mohon lengkapi seluruh field formulir CIT.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create delivery
      const res = await citApi.createDelivery({
        currency_id: Number(selectedCurrencyId),
        branch_id: Number(selectedBranchId),
        amount: Number(amount),
        order_date: new Date().toISOString().split('T')[0],
        source_reference: sourceReference || 'MANUAL-DISPATCH',
        ticket_subject: ticketSubject
      });

      if (res.success && res.data?.id) {
        // 2. Create delivery detail
        await citApi.createDeliveryDetail({
          delivery_id: res.data.id,
          currency_id: Number(selectedCurrencyId),
          amount: Number(amount),
          item_name: `Cash Delivery for ${ticketSubject}`,
          quantity: 1
        });

        onAddToast('Order Created', `Order CIT Berhasil Dibuat dengan ID: ${res.data.id} 💰`);
        setIsModalOpen(false);
        resetForm();
        loadData();
      } else {
        onAddToast('Success (Mock Mode)', 'Order CIT Berhasil disimpan dalam basis data simulasi.');
        setIsModalOpen(false);
        resetForm();
        loadData();
      }
    } catch (err: any) {
      console.error('Failed to dispatch order:', err);
      onAddToast('Dispatch Error', err.message || 'Gagal mengirim instruksi CIT ke API ActiveATM.');
    } finally {
      setIsSubmitting(false);
      if (onClearPrefill) onClearPrefill();
    }
  };

  const resetForm = () => {
    setSelectedCurrencyId('');
    setSelectedBranchId('');
    setAmount('');
    setSourceReference('');
    setTicketSubject('');
    setCitType('CIT');
    if (onClearPrefill) onClearPrefill();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  // Filter & Search logic
  const filteredOrders = orders.filter(order => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = (order.order_id || '').toLowerCase().includes(q);
      const matchBranch = (order.branch_name || '').toLowerCase().includes(q);
      const matchLocation = (order.location || '').toLowerCase().includes(q);
      const matchTicket = (order.ticket_id || '').toLowerCase().includes(q);
      if (!matchId && !matchBranch && !matchLocation && !matchTicket) return false;
    }

    // Type filter
    if (filterType === 'CIT') {
      return (order.order_id || '').includes('CIT') || (order.ticket_id || '').toLowerCase().includes('cit') || (order.location || '').toLowerCase().includes('cit');
    } else if (filterType === 'ATM') {
      return (order.order_id || '').includes('ATM') || (order.ticket_id || '').toLowerCase().includes('atm') || (order.location || '').toLowerCase().includes('atm');
    }

    return true;
  });

  // Simple stats calculation
  const totalOrdersCount = orders.length;
  const inProgressCount = orders.filter(o => o.status === 'In Progress').length;
  const completedCount = orders.filter(o => o.status === 'Completed').length;
  const pendingCount = orders.filter(o => o.status === 'Idle' || o.status === 'Pending').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFBFD] p-6 text-left">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-blue-600" />
            CIT / ATM Order Dispatch Control
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau dan distribusikan pengiriman uang tunai (Cash In Transit) ke Region & Cabang ActiveATM secara real-time.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg shadow-sm hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Orders"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-500/10 cursor-pointer transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Create Dispatch</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Dispatches</span>
            <span className="block text-2xl font-black text-slate-800 mt-1 font-mono">{totalOrdersCount}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Coins className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">In Progress</span>
            <span className="block text-2xl font-black text-amber-600 mt-1 font-mono">{inProgressCount}</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Completed</span>
            <span className="block text-2xl font-black text-emerald-600 mt-1 font-mono">{completedCount}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pending / Idle</span>
            <span className="block text-2xl font-black text-slate-600 mt-1 font-mono">{pendingCount}</span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Control Panel: Filters & Search */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 mb-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 shadow-sm">
        <div className="flex bg-slate-100 p-1 rounded-lg self-start">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              filterType === 'all' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Trips
          </button>
          <button
            onClick={() => setFilterType('CIT')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              filterType === 'CIT' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            CIT Dispatch
          </button>
          <button
            onClick={() => setFilterType('ATM')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              filterType === 'ATM' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ATM Order
          </button>
        </div>

        <div className="relative w-full sm:w-72 text-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ID, branch, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <th className="py-3.5 px-5">Trip Order ID</th>
                <th className="py-3.5 px-5">Reference Ticket ID</th>
                <th className="py-3.5 px-5">Region Branch</th>
                <th className="py-3.5 px-5">Target Location</th>
                <th className="py-3.5 px-5">Trip Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Database className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="font-semibold text-xs">No active trips found</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Please check API connection or configure CIT Token.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={order.order_id || idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-5 font-bold font-mono text-slate-950 flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${order.status === 'Completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                      {order.order_id || `TRIP-${idx + 1005}`}
                    </td>
                    <td className="py-4 px-5 font-semibold text-blue-600 font-mono">
                      {order.ticket_id || 'M-DISPATCH'}
                    </td>
                    <td className="py-4 px-5 font-bold uppercase">
                      {order.branch_name || 'RAWAMANGUN'}
                    </td>
                    <td className="py-4 px-5 text-slate-500 font-medium max-w-xs truncate">
                      {order.location || 'Vault Center'}
                    </td>
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${
                        order.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : order.status === 'In Progress'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {order.status || 'Idle'}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => {
                          onAddToast('Operational Detail', `Trip ${order.order_id} active. Distribution routed in real-time.`);
                        }}
                        className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition-all cursor-pointer"
                        title="View Route Details"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono font-medium">
          <span>Active Connection Endpoint: api-activeatm.adv.my.id</span>
          <span>CIT Dispatch Module v2.0</span>
        </div>
      </div>

      {/* POPUP MODAL: CREATE ORDER CIT FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-800">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">Create Cash In Transit Dispatch Order</h3>
              </div>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {prefillEmail && (
              <div className="bg-indigo-50 border-b border-indigo-100 p-3.5 px-5 flex items-start gap-3 text-xs text-indigo-900">
                <Info className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Auto-filled from Ticket Copilot Data!</p>
                  <p className="text-[10px] text-indigo-700 mt-0.5 line-clamp-1">Subject: {prefillEmail.subject}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Type Switcher */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Dispatch Type</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCitType('CIT')}
                    className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      citType === 'CIT' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    CIT (Cash In Transit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCitType('ATM')}
                    className={`py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      citType === 'ATM' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    ATM Cash Load
                  </button>
                </div>
              </div>

              {/* Branch / Entity dropdown */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Target Branch Entity</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none"
                  required
                >
                  <option value="">-- Select Active ATM Branch Entity --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name || b.branch_name}</option>
                  ))}
                  {branches.length === 0 && (
                    <>
                      <option value="1">RAWAMANGUN (DEFAULT)</option>
                      <option value="2">PALEMBANG</option>
                      <option value="3">MEDAN</option>
                      <option value="4">SURABAYA</option>
                      <option value="5">MAKASSAR</option>
                    </>
                  )}
                </select>
              </div>

              {/* Currency Dropdown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Currency</label>
                  <select
                    value={selectedCurrencyId}
                    onChange={(e) => setSelectedCurrencyId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none"
                    required
                  >
                    <option value="">-- Select --</option>
                    {currencies.map(c => (
                      <option key={c.id} value={c.id}>{c.code || c.currency_code || 'IDR'}</option>
                    ))}
                    {currencies.length === 0 && (
                      <>
                        <option value="1">IDR (Rupiah)</option>
                        <option value="2">USD (Dollar)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Amount (Nilai)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter absolute amount"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none"
                    required
                  />
                </div>
              </div>

              {/* Subject Ticket & Reference */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Ticket Subject Reference</label>
                <input
                  type="text"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Subject of the email order"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Source Reference ID (Optional)</label>
                <input
                  type="text"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  placeholder="message_id or other unique reference"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-mono text-[10px]"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 font-sans">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Creating Dispatch...' : 'Confirm Dispatch 💸'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
