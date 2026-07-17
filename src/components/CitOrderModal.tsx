// src/components/CitOrderModal.tsx

import React, { useState, useEffect } from 'react';
import { Coins, Plus, Trash2, Info, Check, AlertTriangle, X } from 'lucide-react';
import { citApi, Currency, BranchEntity } from '../services/citApi';

interface Email {
  id?: number;
  message_id: string;
  subject: string;
  sender: string;
  receiver: string;
  date: string;
  body_text: string;
  html_body: string;
  tags: string[];
  category?: string;
  sub_category?: string;
  folder_parent?: string;
  folder_child?: string;
  api_workflow_status?: string;
  api_workflow_log?: string;

  // AI fields
  is_read?: boolean;
  tag_type?: string;
  summary?: string;
  action_required?: boolean;
  suggested_tag?: string;
  is_important?: boolean;
  urgency_level?: string;
  suggested_folder_parent?: string;
  suggested_folder_child?: string;
  is_cit_order?: boolean;
  cit_type?: string;
  suggested_bank?: string;
  extracted_notes?: string;
  currency?: string;
  denomination_suggestion?: number;
  total_amount?: number;
}

interface CitOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToast: (title: string, message: string) => void;
  prefillEmail: Email | null;
  onOrderCreated?: () => void;
}

interface DenomRow {
  denomination: number;
  quantity: number;
}

const IDR_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const USD_DENOMINATIONS = [100, 50, 20, 10, 5, 2, 1];

function getDenominationsForCurrency(currencyCode: string): number[] {
  if (String(currencyCode).toUpperCase() === 'USD') {
    return USD_DENOMINATIONS;
  }
  return IDR_DENOMINATIONS;
}

export default function CitOrderModal({
  isOpen,
  onClose,
  onAddToast,
  prefillEmail,
  onOrderCreated
}: CitOrderModalProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [branches, setBranches] = useState<BranchEntity[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Form states
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [sourceReference, setSourceReference] = useState<string>('');
  const [ticketSubject, setTicketSubject] = useState<string>('');
  const [citType, setCitType] = useState<'CIT' | 'ATM'>('CIT');
  const [suggestedBank, setSuggestedBank] = useState<string>('');
  const [extractedNotes, setExtractedNotes] = useState<string>('');

  // Denomination rows state
  const [denomRows, setDenomRows] = useState<DenomRow[]>([]);
  const [isManualMode, setIsManualMode] = useState(false);

  const currentCurrencyCode = currencies.find(c => String(c.id) === selectedCurrencyId)?.code || 
                              currencies.find(c => String(c.id) === selectedCurrencyId)?.currency_code || 
                              'IDR';

  const availableDenoms = getDenominationsForCurrency(currentCurrencyCode);

  // Load API metadata (branches, currencies)
  useEffect(() => {
    if (isOpen) {
      const loadMetadata = async () => {
        setIsLoadingMetadata(true);
        try {
          const [currList, branchList] = await Promise.all([
            citApi.getCurrencies(),
            citApi.getEntityMasterDetails()
          ]);
          setCurrencies(currList);
          setBranches(branchList);
        } catch (err) {
          console.error('Failed to load metadata in CitOrderModal:', err);
          onAddToast('Metadata Load Alert', 'Using default offline branch & currency presets.');
        } finally {
          setIsLoadingMetadata(false);
        }
      };
      loadMetadata();
    }
  }, [isOpen]);

  // Sync / Prefill form fields when prefillEmail or metadata changes
  useEffect(() => {
    if (isOpen && prefillEmail) {
      setTicketSubject(prefillEmail.subject || '');
      setSourceReference(prefillEmail.message_id || '');
      setCitType(prefillEmail.cit_type === 'ATM' ? 'ATM' : 'CIT');
      setSuggestedBank(prefillEmail.suggested_bank || '');
      setExtractedNotes(prefillEmail.extracted_notes || '');

      // Parse and prefill Branch
      const branchMatch = (prefillEmail.body_text || '').match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
      const extractedBranch = branchMatch ? branchMatch[1].trim() : (prefillEmail.folder_child || '');

      if (extractedBranch && branches.length > 0) {
        const found = branches.find(b => 
          (b.name || '').toLowerCase().includes(extractedBranch.toLowerCase()) || 
          (b.branch_name || '').toLowerCase().includes(extractedBranch.toLowerCase())
        );
        if (found) {
          setSelectedBranchId(String(found.id));
        } else {
          // Check if folder_child matches a branch directly
          const fallback = branches.find(b => 
            (b.name || '').toLowerCase() === (prefillEmail.folder_child || '').toLowerCase() || 
            (b.branch_name || '').toLowerCase() === (prefillEmail.folder_child || '').toLowerCase()
          );
          if (fallback) setSelectedBranchId(String(fallback.id));
        }
      } else if (branches.length > 0) {
        // Fallback to RAWAMANGUN (typically ID 1 or first element)
        setSelectedBranchId(String(branches[0].id));
      }

      // Parse and prefill Amount with AI-extracted total_amount priority
      let parsedAmount = '';
      if (prefillEmail.total_amount && Number(prefillEmail.total_amount) > 0) {
        parsedAmount = String(prefillEmail.total_amount);
      } else {
        const amountMatch = (prefillEmail.body_text || '').match(/(?:Amount|Nilai)\s*[:=]\s*([\d,.]+)/i);
        parsedAmount = amountMatch ? amountMatch[1].replace(/[,.]/g, '') : '';
        if (!parsedAmount && prefillEmail.body_text) {
          // Look for denom clues in extracted_notes or body (e.g. 100k, 50k, total digits)
          const digitsMatch = prefillEmail.body_text.match(/\b\d{5,10}\b/g);
          if (digitsMatch && digitsMatch.length > 0) {
            parsedAmount = digitsMatch[0];
          }
        }
      }
      const finalAmountVal = parsedAmount || (prefillEmail.currency === 'USD' ? '1000' : '100000000');
      setAmount(finalAmountVal);

      // Parse and prefill Currency with AI-extracted currency priority
      const currMatch = (prefillEmail.body_text || '').match(/(?:Currency|Mata\s+Uang|Currency\s+Code)\s*[:=]\s*([a-zA-Z]{3})/i);
      const extractedCurr = (prefillEmail.currency || (currMatch ? currMatch[1].toUpperCase() : 'IDR')).toUpperCase();
      if (extractedCurr && currencies.length > 0) {
        const found = currencies.find(c => 
          (c.code || '').toUpperCase() === extractedCurr || 
          (c.currency_code || '').toUpperCase() === extractedCurr
        );
        if (found) setSelectedCurrencyId(String(found.id));
      } else if (currencies.length > 0) {
        const idr = currencies.find(c => (c.code || '').toUpperCase() === 'IDR' || (c.currency_code || '').toUpperCase() === 'IDR');
        if (idr) setSelectedCurrencyId(String(idr.id));
      }

      // Dynamically generate default denomination rows
      const rows: DenomRow[] = [];
      const activeCurr = prefillEmail.currency || extractedCurr || 'IDR';
      const availableList = getDenominationsForCurrency(activeCurr);

      if (prefillEmail.denomination_suggestion && Number(prefillEmail.denomination_suggestion) > 0) {
        const targetAmount = Number(finalAmountVal);
        const suggestion = Number(prefillEmail.denomination_suggestion);
        rows.push({
          denomination: suggestion,
          quantity: Math.floor(targetAmount / suggestion) || 1
        });
      } else {
        const lowercaseNotes = (prefillEmail.extracted_notes || '').toLowerCase() + ' ' + (prefillEmail.body_text || '').toLowerCase();
        if (activeCurr.toUpperCase() === 'USD') {
          if (lowercaseNotes.includes('100 dollar') || lowercaseNotes.includes('100$') || lowercaseNotes.includes('denom 100')) {
            rows.push({ denomination: 100, quantity: 10 });
          }
          if (lowercaseNotes.includes('50 dollar') || lowercaseNotes.includes('50$') || lowercaseNotes.includes('denom 50')) {
            rows.push({ denomination: 50, quantity: 20 });
          }
        } else {
          if (lowercaseNotes.includes('100k') || lowercaseNotes.includes('100.000') || lowercaseNotes.includes('100 ribu')) {
            rows.push({ denomination: 100000, quantity: 1000 });
          }
          if (lowercaseNotes.includes('50k') || lowercaseNotes.includes('50.000') || lowercaseNotes.includes('50 ribu')) {
            rows.push({ denomination: 50000, quantity: 1000 });
          }
        }
      }

      if (rows.length === 0) {
        const defaultDenom = availableList[0] || (activeCurr.toUpperCase() === 'USD' ? 100 : 100000);
        const targetAmount = Number(finalAmountVal);
        rows.push({ denomination: defaultDenom, quantity: Math.floor(targetAmount / defaultDenom) || 1 });
      }
      setDenomRows(rows);
    } else if (isOpen) {
      // Clear form
      resetForm();
    }
  }, [isOpen, prefillEmail, branches, currencies]);

  // Update denomination rows when currency changes to prevent cross-currency mismatch
  useEffect(() => {
    if (isOpen && selectedCurrencyId && currencies.length > 0) {
      const activeCurr = currencies.find(c => String(c.id) === selectedCurrencyId)?.code || 
                         currencies.find(c => String(c.id) === selectedCurrencyId)?.currency_code || 
                         'IDR';
      const availableList = getDenominationsForCurrency(activeCurr);
      
      setDenomRows(prev => {
        const isMismatched = prev.some(r => !availableList.includes(r.denomination));
        if (isMismatched && !isManualMode) {
          const defaultDenom = availableList[0] || (activeCurr.toUpperCase() === 'USD' ? 100 : 100000);
          const targetAmount = amount ? Number(amount) : (activeCurr.toUpperCase() === 'USD' ? 1000 : 100000000);
          return [{
            denomination: defaultDenom,
            quantity: Math.floor(targetAmount / defaultDenom) || 1
          }];
        }
        return prev;
      });
    }
  }, [selectedCurrencyId, currencies, isOpen]);

  // Recalculate calculated total
  const calculatedTotal = denomRows.reduce((sum, r) => sum + (r.denomination * r.quantity), 0);

  const resetForm = () => {
    setSelectedCurrencyId('');
    setSelectedBranchId('');
    setAmount('');
    setSourceReference('');
    setTicketSubject('');
    setCitType('CIT');
    setSuggestedBank('');
    setExtractedNotes('');
    setDenomRows([{ denomination: 100000, quantity: 1000 }]);
    setIsManualMode(false);
  };

  const addDenomRow = () => {
    const defaultDenom = availableDenoms[0] || 50000;
    setDenomRows(prev => [...prev, { denomination: defaultDenom, quantity: 100 }]);
  };

  const removeDenomRow = (index: number) => {
    setDenomRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDenomChange = (index: number, field: keyof DenomRow, value: number) => {
    setDenomRows(prev => prev.map((row, idx) => {
      if (idx === index) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleSyncCalculatedTotal = () => {
    setAmount(String(calculatedTotal));
    onAddToast('Total Nominal Disamakan', `Total nominal disesuaikan dengan nilai perhitungan pecahan: ${currentCurrencyCode} ${calculatedTotal.toLocaleString()}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurrencyId || !selectedBranchId || !amount || !ticketSubject) {
      onAddToast('Validation Error', 'Mohon lengkapi seluruh field utama formulir.');
      return;
    }

    if (denomRows.length === 0) {
      onAddToast('Validation Error', 'Mohon tambahkan minimal satu baris pecahan denominasi.');
      return;
    }

    const emailTotalNum = Number(amount);
    if (calculatedTotal !== emailTotalNum) {
      if (!confirm(`Peringatan: Total perhitungan pecahan (${currentCurrencyCode} ${calculatedTotal.toLocaleString()}) tidak sesuai dengan Total Nominal Form (${currentCurrencyCode} ${emailTotalNum.toLocaleString()}). Apakah Anda ingin melanjutkan (Manual Override)?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Create delivery header
      const res = await citApi.createDelivery({
        currency_id: Number(selectedCurrencyId),
        branch_id: Number(selectedBranchId),
        amount: Number(amount),
        order_date: new Date().toISOString().split('T')[0],
        source_reference: sourceReference || 'MANUAL-DISPATCH',
        ticket_subject: `[${suggestedBank || 'CIT'}] ${ticketSubject}`
      });

      if (res.success && res.data?.id) {
        // 2. Create delivery details for each denomination
        for (const row of denomRows) {
          await citApi.createDeliveryDetail({
            delivery_id: res.data.id,
            currency_id: Number(selectedCurrencyId),
            amount: row.denomination * row.quantity,
            item_name: `Pecahan Rp ${row.denomination.toLocaleString('id-ID')} (${row.quantity} Lembar)`,
            quantity: row.quantity
          });
        }

        // 3. Mark the email as processed/triggered in the local DB & Supabase
        if (prefillEmail?.message_id) {
          const successLog = `[SUCCESS] Dispatch Order Created at ${new Date().toLocaleString()}\n` +
            `Order ID: ${res.data.id}\n` +
            `Branch: ${branches.find(b => String(b.id) === selectedBranchId)?.name || 'N/A'}\n` +
            `Notes: ${extractedNotes}\n` +
            `Total: Rp ${calculatedTotal.toLocaleString('id-ID')}\n` +
            `Denominations: ${denomRows.map(r => `Rp ${r.denomination} x ${r.quantity} lembar`).join(', ')}`;

          await fetch('/api/emails/update-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message_id: prefillEmail.message_id,
              fields: {
                api_workflow_status: 'triggered',
                api_workflow_log: successLog
              }
            })
          });
        }

        onAddToast('Order Created', `Order CIT Berhasil Dibuat dengan ID: ${res.data.id} 💰`);
        if (onOrderCreated) onOrderCreated();
        onClose();
      } else {
        onAddToast('Order Failed', 'Gagal memproses pembuatan order CIT pada server.');
      }
    } catch (err: any) {
      console.error('Failed to create CIT order:', err);
      onAddToast('Dispatch Error', err.message || 'Gagal mengirim instruksi CIT ke API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalDiff = Number(amount) - calculatedTotal;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] animate-fade-in text-left">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-blue-600 animate-bounce" />
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Disposisi & Entry Pecahan CIT / ATM Order</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Automasi pemesanan cash-in-transit dengan pembagian pecahan uang lembar</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {prefillEmail && (
          <div className="bg-blue-50/60 border-b border-blue-100 p-4 px-6 flex items-start gap-3.5 text-xs text-blue-900 select-text">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Ektraksi AI Asisten Berhasil Diisi!</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-blue-800 mt-1.5 font-medium bg-white/60 p-2.5 rounded-lg border border-blue-100/30">
                <p>Bank Tujuan: <span className="font-bold text-slate-950">{prefillEmail.suggested_bank || 'N/A'}</span></p>
                <p>Urgency Level: <span className="font-bold text-slate-950">{prefillEmail.urgency_level || 'Routine'}</span></p>
                <p className="col-span-2 mt-1 border-t border-slate-100 pt-1 text-slate-600 font-normal italic">
                  Notes: "{prefillEmail.extracted_notes || 'Tidak ada catatan khusus dari email'}"
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          
          <div className="grid grid-cols-2 gap-4">
            {/* Dispatch Type */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Tipe Dispatch</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCitType('CIT')}
                  className={`py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    citType === 'CIT' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  CIT (Cash Transit)
                </button>
                <button
                  type="button"
                  onClick={() => setCitType('ATM')}
                  className={`py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    citType === 'ATM' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ATM Load Uang
                </button>
              </div>
            </div>

            {/* Target Branch */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Cabang / Target Entity</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-medium"
                required
              >
                <option value="">-- Pilih Cabang --</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name || b.branch_name}</option>
                ))}
                {branches.length === 0 && (
                  <>
                    <option value="1">RAWAMANGUN (REGION 1)</option>
                    <option value="2">PALEMBANG (REGION 1)</option>
                    <option value="3">MEDAN (REGION 1)</option>
                    <option value="4">SURABAYA (REGION 6)</option>
                    <option value="5">PURWOKERTO (REGION 5)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Bank Penerima */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Bank Penerima</label>
              <input
                type="text"
                value={suggestedBank}
                onChange={(e) => setSuggestedBank(e.target.value)}
                placeholder="e.g. MAYBANK, BCA"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-bold uppercase text-blue-700"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Mata Uang</label>
              <select
                value={selectedCurrencyId}
                onChange={(e) => setSelectedCurrencyId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-medium"
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

            {/* Amount / Total Nominal */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Total Nominal (Form)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Total order nominal"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-black text-slate-900"
                required
              />
            </div>
          </div>

          {/* DYNAMIC DENOMINATION SECTION */}
          <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50">
            <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 pb-2">
              <span className="font-bold text-[11px] text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                <Coins className="h-4 w-4 text-amber-500" />
                Pecahan & Denominasi Dynamic Uang ({currentCurrencyCode})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualMode(!isManualMode)}
                  className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold shadow-xs cursor-pointer transition-colors ${
                    isManualMode 
                      ? 'bg-amber-100 border-amber-300 text-amber-800' 
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  {isManualMode ? 'Mode List Standar' : 'Switch Input Manual'}
                </button>
                <button
                  type="button"
                  onClick={addDenomRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-blue-600 font-bold rounded-lg text-[10px] shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tambah Baris</span>
                </button>
              </div>
            </div>

            {denomRows.length === 0 ? (
              <div className="p-6 text-center text-slate-400 italic bg-white rounded-lg border border-dashed border-slate-200 mb-2">
                Belum ada pecahan uang ditambahkan. Klik tombol tambah baris pecahan.
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {denomRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-12 gap-3 items-center bg-white p-2.5 rounded-lg border border-slate-200/85 shadow-xs">
                    {/* Manual or Select Denomination */}
                    <div className="col-span-4">
                      {isManualMode ? (
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-[10px] text-slate-400 font-bold">{currentCurrencyCode}</span>
                          <input
                            type="number"
                            value={row.denomination}
                            onChange={(e) => handleDenomChange(index, 'denomination', Number(e.target.value))}
                            placeholder="Nominal"
                            className="w-full p-2 pl-10 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md outline-none font-bold"
                          />
                        </div>
                      ) : (
                        <select
                          value={row.denomination}
                          onChange={(e) => handleDenomChange(index, 'denomination', Number(e.target.value))}
                          className="w-full p-2 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md outline-none font-bold"
                        >
                          {availableDenoms.map(d => (
                            <option key={d} value={d}>
                              {currentCurrencyCode} {d.toLocaleString()}
                            </option>
                          ))}
                          {!availableDenoms.includes(row.denomination) && (
                            <option value={row.denomination}>
                              {currentCurrencyCode} {row.denomination.toLocaleString()}
                            </option>
                          )}
                        </select>
                      )}
                    </div>

                    {/* Quantity (Lembar) */}
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) => handleDenomChange(index, 'quantity', Math.max(1, Number(e.target.value)))}
                        placeholder="Quantity"
                        className="w-full p-2 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md outline-none text-center font-semibold"
                        required
                      />
                    </div>

                    {/* Label/Suffix */}
                    <div className="col-span-1 text-center text-slate-400 font-medium text-[10px]">
                      Lembar
                    </div>

                    {/* Calculated Subtotal */}
                    <div className="col-span-3 font-mono font-bold text-slate-900 text-right pr-2">
                      {currentCurrencyCode} {(row.denomination * row.quantity).toLocaleString()}
                    </div>

                    {/* Delete button */}
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeDenomRow(index)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-md cursor-pointer transition-colors"
                        title="Hapus baris pecahan"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations and validations panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Hasil Hitung Pecahan</p>
                <p className="text-lg font-black text-blue-600 font-mono mt-0.5">
                  {currentCurrencyCode} {calculatedTotal.toLocaleString()}
                </p>
              </div>

              {/* Validation indicators */}
              <div className="flex items-center gap-2">
                {totalDiff === 0 ? (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-2 px-3 flex items-center gap-1.5 font-semibold text-[11px]">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Perhitungan Sesuai dengan Nominal Utama</span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-1.5 px-3 flex items-center gap-1.5 font-medium text-[10px]">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
                      <div>
                        <span>Selisih: {currentCurrencyCode} {totalDiff.toLocaleString()}</span>
                        <span className="block text-[9px] text-amber-600 font-normal">
                          {totalDiff > 0 ? 'Pecahan kurang' : 'Pecahan berlebih'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSyncCalculatedTotal}
                      className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-100 rounded-lg text-[10px] cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Samakan Nominal Utama
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes / Special Instruction */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Instruksi Khusus Operator (Extracted Notes)</label>
            <textarea
              value={extractedNotes}
              onChange={(e) => setExtractedNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Droping uang 100k dan 50k untuk KC Asia Afrika"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none leading-relaxed font-semibold text-slate-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Subject Ticket Reference */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Referensi Judul Tiket</label>
              <input
                type="text"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="Referensi email"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-medium text-slate-500"
                required
              />
            </div>

            {/* Source Reference ID */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Source Reference ID</label>
              <input
                type="text"
                value={sourceReference}
                onChange={(e) => setSourceReference(e.target.value)}
                placeholder="Unique message ID"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs outline-none font-mono text-slate-500 text-[10px]"
              />
            </div>
          </div>

          {totalDiff !== 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 px-4 text-[11px] text-amber-800 flex items-start gap-2.5 animate-pulse">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Peringatan Selisih Nominal!</p>
                <p className="text-slate-600 mt-0.5">
                  Total nominal form ({currentCurrencyCode} {Number(amount || 0).toLocaleString()}) tidak sama dengan hasil hitung pecahan ({currentCurrencyCode} {calculatedTotal.toLocaleString()}).
                </p>
                <p className="text-[10px] text-amber-700 font-semibold mt-1">
                  * Operator diperbolehkan menekan tombol submit di bawah untuk melakukan Manual Override dan tetap mengirim order.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 font-sans">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-lg shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
            >
              {isSubmitting ? 'Memproses Order...' : 'Konfirmasi & Dispatch Order CIT 💸'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
