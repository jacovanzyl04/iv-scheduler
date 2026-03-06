import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BRANCHES } from '../data/initialData';
import { DEFAULT_VIALS } from '../data/defaultVials';
import { DEFAULT_CONSUMABLES } from '../data/defaultConsumables';
import { useIsMobile } from './Sidebar';
import {
  ArrowRightLeft, ArrowRight, Plus, History, ChevronLeft,
  FileSpreadsheet, FileText, X, Search, Package, ShoppingCart,
  Check, Filter, Truck, Trash2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ label, color }) {
  const colorMap = {
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    gray: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full font-medium border px-2 py-0.5 text-[11px] ${colorMap[color] || colorMap.gray}`}>
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color, subtitle }) {
  const borderColors = {
    red: 'border-l-red-500',
    orange: 'border-l-orange-500',
    amber: 'border-l-amber-500',
    green: 'border-l-green-500',
    blue: 'border-l-blue-500',
    purple: 'border-l-purple-500',
  };
  return (
    <div className={`bg-d4l-surface border border-d4l-border rounded-xl p-4 border-l-4 ${borderColors[color] || 'border-l-d4l-gold'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-d4l-muted" />
        <span className="text-xs text-d4l-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-d4l-text font-[Bebas_Neue] tracking-wide">{value}</p>
      {subtitle && <p className="text-[11px] text-d4l-dim mt-0.5">{subtitle}</p>}
    </div>
  );
}

// Determine the transfer type from the selected items
function getTransferType(selectedItems) {
  const hasVials = selectedItems.some(i => i.itemType === 'vial');
  const hasConsumables = selectedItems.some(i => i.itemType === 'consumable');
  if (hasVials && hasConsumables) return 'mixed';
  if (hasVials) return 'vials';
  if (hasConsumables) return 'consumables';
  return 'mixed';
}

function getTypeBadge(type) {
  if (type === 'vials') return { label: 'Vials', color: 'purple' };
  if (type === 'consumables') return { label: 'Consumables', color: 'blue' };
  return { label: 'Mixed', color: 'amber' };
}

// New Transfer Modal (mobile full-screen or desktop modal)
function NewTransferModal({ onClose, onSubmit, vialStock, consumablesStock, staffName, isMobile }) {
  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // [{ itemId, name, quantity, itemType }]
  const [searchQuery, setSearchQuery] = useState('');
  const [step, setStep] = useState(1); // 1: select branches, 2: select items, 3: confirm
  const [notes, setNotes] = useState('');
  const [viewTab, setViewTab] = useState('all'); // 'all' | 'vials' | 'consumables'

  // Get ALL items (both vials and consumables)
  const allItems = useMemo(() => {
    const vials = (vialStock?.vials || DEFAULT_VIALS).map(v => ({
      id: v.id, name: v.name, itemType: 'vial'
    }));
    const consumables = (consumablesStock?.items || DEFAULT_CONSUMABLES).map(c => ({
      id: c.id, name: c.name, code: c.code, unit: c.unit, itemType: 'consumable'
    }));
    return [...vials, ...consumables];
  }, [vialStock, consumablesStock]);

  // Filter by tab and search
  const filteredItems = useMemo(() => {
    let result = allItems;
    if (viewTab === 'vials') result = result.filter(i => i.itemType === 'vial');
    if (viewTab === 'consumables') result = result.filter(i => i.itemType === 'consumable');
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.code && item.code.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allItems, viewTab, searchQuery]);

  const toggleItem = (item) => {
    setSelectedItems(prev => {
      const existing = prev.find(s => s.itemId === item.id);
      if (existing) {
        return prev.filter(s => s.itemId !== item.id);
      }
      const entry = { itemId: item.id, name: item.name, itemType: item.itemType, quantity: 1 };
      if (item.code) entry.code = item.code;
      if (item.unit) entry.unit = item.unit;
      return [...prev, entry];
    });
  };

  const updateQuantity = (itemId, qty) => {
    setSelectedItems(prev =>
      prev.map(s => s.itemId === itemId ? { ...s, quantity: Math.max(1, qty) } : s)
    );
  };

  const fromBranchObj = BRANCHES.find(b => b.id === fromBranch);
  const toBranchObj = BRANCHES.find(b => b.id === toBranch);

  const canProceedStep1 = fromBranch && toBranch && fromBranch !== toBranch;
  const canProceedStep2 = selectedItems.length > 0;

  const transferType = getTransferType(selectedItems);
  const typeBadge = getTypeBadge(transferType);

  // Group selected items by type for confirmation
  const selectedVials = selectedItems.filter(i => i.itemType === 'vial');
  const selectedConsumables = selectedItems.filter(i => i.itemType === 'consumable');

  // Count selected per tab
  const vialCount = selectedItems.filter(i => i.itemType === 'vial').length;
  const consumableCount = selectedItems.filter(i => i.itemType === 'consumable').length;

  const handleSubmit = () => {
    onSubmit({
      type: transferType,
      fromBranch,
      toBranch,
      items: selectedItems,
      notes,
      submittedBy: staffName || 'Unknown',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      id: `txfr-${Date.now()}`,
    });
    onClose();
  };

  const content = (
    <div className={`${isMobile ? 'fixed inset-0 z-[200] bg-d4l-bg flex flex-col' : 'fixed inset-0 z-[200] flex items-center justify-center'}`}>
      {!isMobile && <div className="absolute inset-0 bg-black/60" onClick={onClose} />}

      <div className={`${isMobile ? 'flex-1 flex flex-col overflow-hidden' : 'relative bg-d4l-surface border border-d4l-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-d4l-border shrink-0">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-1.5 rounded-lg hover:bg-d4l-hover text-d4l-muted">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-bold text-d4l-text font-[Bebas_Neue] tracking-wider">
              {step === 1 ? 'New Transfer' : step === 2 ? 'Select Items' : 'Confirm Transfer'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-d4l-hover text-d4l-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-d4l-border shrink-0">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                s < step ? 'bg-green-500/20 text-green-400' :
                s === step ? 'bg-d4l-gold/20 text-d4l-gold' :
                'bg-d4l-hover text-d4l-dim'
              }`}>
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={`text-[11px] ${s === step ? 'text-d4l-text' : 'text-d4l-dim'} hidden sm:block`}>
                {s === 1 ? 'Branches' : s === 2 ? 'Items' : 'Confirm'}
              </span>
              {s < 3 && <div className="flex-1 h-px bg-d4l-border" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* STEP 1: Select branches */}
          {step === 1 && (
            <div className="space-y-5">
              {/* From Branch */}
              <div>
                <label className="text-xs text-d4l-muted mb-2 block font-medium">From Branch</label>
                <div className="grid grid-cols-2 gap-2">
                  {BRANCHES.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => setFromBranch(branch.id)}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        fromBranch === branch.id
                          ? 'text-white'
                          : toBranch === branch.id
                            ? 'border-d4l-border bg-d4l-raised text-d4l-dim opacity-40 cursor-not-allowed'
                            : 'border-d4l-border bg-d4l-raised text-d4l-text2 hover:border-d4l-gold/30'
                      }`}
                      style={fromBranch === branch.id ? { borderColor: branch.color, backgroundColor: branch.color + '20', color: branch.color } : {}}
                      disabled={toBranch === branch.id}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              {fromBranch && (
                <div className="flex justify-center">
                  <div className="w-10 h-10 rounded-full bg-d4l-raised border border-d4l-border flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-d4l-gold" />
                  </div>
                </div>
              )}

              {/* To Branch */}
              <div>
                <label className="text-xs text-d4l-muted mb-2 block font-medium">To Branch</label>
                <div className="grid grid-cols-2 gap-2">
                  {BRANCHES.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => setToBranch(branch.id)}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        toBranch === branch.id
                          ? 'text-white'
                          : fromBranch === branch.id
                            ? 'border-d4l-border bg-d4l-raised text-d4l-dim opacity-40 cursor-not-allowed'
                            : 'border-d4l-border bg-d4l-raised text-d4l-text2 hover:border-d4l-gold/30'
                      }`}
                      style={toBranch === branch.id ? { borderColor: branch.color, backgroundColor: branch.color + '20', color: branch.color } : {}}
                      disabled={fromBranch === branch.id}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Select items from both vials & consumables */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-d4l-dim" />
                <input
                  type="text"
                  placeholder="Search vials & consumables..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-d4l-raised border border-d4l-border rounded-xl text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/50"
                />
              </div>

              {/* Category tabs */}
              <div className="flex gap-1.5">
                {[
                  { key: 'all', label: 'All', count: selectedItems.length },
                  { key: 'vials', label: 'Vials', count: vialCount, icon: Package },
                  { key: 'consumables', label: 'Consumables', count: consumableCount, icon: ShoppingCart },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setViewTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      viewTab === tab.key
                        ? 'bg-d4l-gold/15 text-d4l-gold border border-d4l-gold/30'
                        : 'bg-d4l-raised text-d4l-muted border border-d4l-border hover:border-d4l-gold/20'
                    }`}
                  >
                    {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="bg-d4l-gold/20 text-d4l-gold text-[10px] px-1.5 py-0.5 rounded-full font-bold">{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Selected count */}
              {selectedItems.length > 0 && (
                <div className="text-xs text-d4l-gold font-medium">
                  {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                  {vialCount > 0 && consumableCount > 0 && (
                    <span className="text-d4l-dim"> ({vialCount} vial{vialCount !== 1 ? 's' : ''}, {consumableCount} consumable{consumableCount !== 1 ? 's' : ''})</span>
                  )}
                </div>
              )}

              {/* Item list */}
              <div className="space-y-1.5">
                {filteredItems.map(item => {
                  const selected = selectedItems.find(s => s.itemId === item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item)}
                      className={`rounded-xl border p-3 transition-all cursor-pointer ${
                        selected
                          ? 'border-d4l-gold/40 bg-d4l-gold/5'
                          : 'border-d4l-border bg-d4l-raised hover:border-d4l-gold/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all ${
                            selected
                              ? 'bg-d4l-gold border-d4l-gold'
                              : 'border-d4l-border hover:border-d4l-gold/50'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 text-black" />}
                        </div>

                        {/* Item info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-d4l-text font-medium truncate">{item.name}</p>
                            {item.itemType === 'vial' ? (
                              <Package className="w-3 h-3 text-purple-400 shrink-0" />
                            ) : (
                              <ShoppingCart className="w-3 h-3 text-blue-400 shrink-0" />
                            )}
                          </div>
                          {item.code ? (
                            <p className="text-[11px] text-d4l-dim">{item.code} · {item.unit}</p>
                          ) : (
                            <p className="text-[11px] text-d4l-dim">Vial</p>
                          )}
                        </div>

                        {/* Quantity stepper (only if selected) */}
                        {selected && (
                          <div className="flex items-center gap-0 shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => updateQuantity(item.id, selected.quantity - 1)}
                              className="w-8 h-8 rounded-l-lg bg-d4l-hover border border-d4l-border flex items-center justify-center text-d4l-text shrink-0"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={selected.quantity}
                              onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-12 h-8 bg-d4l-raised border-y border-d4l-border text-center text-sm text-d4l-text focus:outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => updateQuantity(item.id, selected.quantity + 1)}
                              className="w-8 h-8 rounded-r-lg bg-d4l-hover border border-d4l-border flex items-center justify-center text-d4l-text shrink-0"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Transfer summary */}
              <div className="bg-d4l-raised border border-d4l-border rounded-xl p-4">
                <div className="flex items-center gap-3 justify-center mb-3">
                  <div className="text-center">
                    <p className="text-[11px] text-d4l-dim mb-0.5">From</p>
                    <p className="text-sm font-bold" style={{ color: fromBranchObj?.color }}>{fromBranchObj?.name}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-d4l-gold shrink-0" />
                  <div className="text-center">
                    <p className="text-[11px] text-d4l-dim mb-0.5">To</p>
                    <p className="text-sm font-bold" style={{ color: toBranchObj?.color }}>{toBranchObj?.name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <StatusBadge label={typeBadge.label} color={typeBadge.color} />
                </div>
              </div>

              {/* Items grouped by type */}
              {selectedVials.length > 0 && (
                <div>
                  <h3 className="text-xs text-d4l-muted font-medium mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-purple-400" />
                    Vials ({selectedVials.length})
                  </h3>
                  <div className="space-y-1.5">
                    {selectedVials.map(item => (
                      <div key={item.itemId} className="flex items-center justify-between bg-d4l-raised border border-d4l-border rounded-lg px-3 py-2">
                        <p className="text-sm text-d4l-text truncate">{item.name}</p>
                        <p className="text-sm font-bold text-d4l-gold shrink-0 ml-3">{item.quantity}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedConsumables.length > 0 && (
                <div>
                  <h3 className="text-xs text-d4l-muted font-medium mb-2 flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                    Consumables ({selectedConsumables.length})
                  </h3>
                  <div className="space-y-1.5">
                    {selectedConsumables.map(item => (
                      <div key={item.itemId} className="flex items-center justify-between bg-d4l-raised border border-d4l-border rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-d4l-text truncate">{item.name}</p>
                          {item.code && <p className="text-[11px] text-d4l-dim">{item.code}</p>}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-bold text-d4l-gold">{item.quantity}</p>
                          {item.unit && <p className="text-[10px] text-d4l-dim">{item.unit}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-d4l-muted mb-1.5 block font-medium">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Requested by manager, urgent restock..."
                  rows={3}
                  className="w-full px-3 py-2 bg-d4l-raised border border-d4l-border rounded-xl text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/50 resize-none"
                />
              </div>

              {/* Submitted by */}
              <div className="text-xs text-d4l-dim">
                Submitted by: <span className="text-d4l-text2">{staffName || 'Unknown'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-d4l-border shrink-0">
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-d4l-gold text-black hover:brightness-110"
            >
              Next — Select Items
            </button>
          )}
          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-d4l-gold text-black hover:brightness-110"
            >
              Next — Review Transfer
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleSubmit}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all bg-green-600 text-white hover:bg-green-500"
            >
              Confirm Transfer
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default function BranchTransfers({
  branchTransfers,
  setBranchTransfers,
  vialStock,
  consumablesStock,
  userRole,
  currentUser,
  staffName,
}) {
  const isMobile = useIsMobile();
  const [showNewTransfer, setShowNewTransfer] = useState(false);
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'vials' | 'consumables'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState(null); // for viewing details
  const [deleteConfirmId, setDeleteConfirmId] = useState(null); // transfer ID pending delete confirmation

  const isAdmin = userRole === 'admin';
  const transfers = branchTransfers?.history || [];

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);
    const todayTransfers = transfers.filter(t => t.date === today);
    const monthTransfers = transfers.filter(t => t.date?.startsWith(thisMonth));
    const totalItems = monthTransfers.reduce((sum, t) => sum + (t.items?.length || 0), 0);
    return {
      today: todayTransfers.length,
      month: monthTransfers.length,
      totalItems,
      total: transfers.length,
    };
  }, [transfers]);

  // Filtered and sorted transfers
  const filteredTransfers = useMemo(() => {
    let result = [...transfers];

    // Filter by branch (either from or to)
    if (filterBranch !== 'all') {
      result = result.filter(t => t.fromBranch === filterBranch || t.toBranch === filterBranch);
    }

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(t => {
        if (filterType === 'mixed') return t.type === 'mixed';
        if (filterType === 'vials') return t.type === 'vials' || t.type === 'mixed';
        if (filterType === 'consumables') return t.type === 'consumables' || t.type === 'mixed';
        return true;
      });
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.items?.some(i => i.name?.toLowerCase().includes(q)) ||
        t.submittedBy?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q) ||
        BRANCHES.find(b => b.id === t.fromBranch)?.name.toLowerCase().includes(q) ||
        BRANCHES.find(b => b.id === t.toBranch)?.name.toLowerCase().includes(q)
      );
    }

    // Sort by newest first
    result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return result;
  }, [transfers, filterBranch, filterType, searchQuery]);

  const handleNewTransfer = (transfer) => {
    setBranchTransfers(prev => ({
      ...prev,
      history: [...(prev.history || []), transfer],
    }));
  };

  const handleDeleteTransfer = (transferId) => {
    setBranchTransfers(prev => ({
      ...prev,
      history: (prev.history || []).filter(t => t.id !== transferId),
    }));
    setDeleteConfirmId(null);
    setSelectedTransfer(null);
  };

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    // Header
    doc.setFillColor(8, 8, 8);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(232, 232, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('DRIP4LIFE', 14, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Branch Transfers Report', 14, 24);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 14, 30);
    if (filterBranch !== 'all') {
      const branchName = BRANCHES.find(b => b.id === filterBranch)?.name || filterBranch;
      doc.text(`Branch: ${branchName}`, 120, 30);
    }

    const tableData = filteredTransfers.map(t => {
      const from = BRANCHES.find(b => b.id === t.fromBranch)?.name || t.fromBranch;
      const to = BRANCHES.find(b => b.id === t.toBranch)?.name || t.toBranch;
      const itemSummary = t.items?.map(i => `${i.name} (${i.quantity})`).join(', ') || '';
      return [
        formatDate(t.timestamp),
        getTypeBadge(t.type).label,
        from,
        to,
        itemSummary,
        t.submittedBy || '',
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Type', 'From', 'To', 'Items', 'By']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30], textColor: [232, 232, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        4: { cellWidth: 50 },
      },
    });

    doc.save(`branch-transfers-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Export Excel
  const exportExcel = () => {
    const data = filteredTransfers.map(t => ({
      'Date': formatDateTime(t.timestamp),
      'Type': getTypeBadge(t.type).label,
      'From Branch': BRANCHES.find(b => b.id === t.fromBranch)?.name || t.fromBranch,
      'To Branch': BRANCHES.find(b => b.id === t.toBranch)?.name || t.toBranch,
      'Items': t.items?.map(i => `${i.name} x${i.quantity}`).join(', ') || '',
      'Total Items': t.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
      'Submitted By': t.submittedBy || '',
      'Notes': t.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    // Style header row
    const cols = Object.keys(data[0] || {});
    cols.forEach((_, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: '1E1E1E' } },
          font: { color: { rgb: 'E8E800' }, bold: true, sz: 11 },
          border: { bottom: { style: 'thin', color: { rgb: '444444' } } },
        };
      }
    });
    // Column widths
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transfers');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `branch-transfers-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Transfer detail view modal
  const TransferDetailModal = ({ transfer, onClose }) => {
    const fromB = BRANCHES.find(b => b.id === transfer.fromBranch);
    const toB = BRANCHES.find(b => b.id === transfer.toBranch);
    const isConfirmingDelete = deleteConfirmId === transfer.id;

    const content = (
      <div className={`${isMobile ? 'fixed inset-0 z-[200] bg-d4l-bg flex flex-col' : 'fixed inset-0 z-[200] flex items-center justify-center'}`}>
        {!isMobile && <div className="absolute inset-0 bg-black/60" onClick={onClose} />}
        <div className={`${isMobile ? 'flex-1 flex flex-col overflow-hidden' : 'relative bg-d4l-surface border border-d4l-border rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl'}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-d4l-border shrink-0">
            <h2 className="text-lg font-bold text-d4l-text font-[Bebas_Neue] tracking-wider">Transfer Details</h2>
            <div className="flex items-center gap-1">
              {isAdmin && (
                <button
                  onClick={() => setDeleteConfirmId(transfer.id)}
                  className="p-2 rounded-lg hover:bg-red-500/15 text-d4l-muted hover:text-red-400 transition-colors"
                  title="Delete transfer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-d4l-hover text-d4l-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Delete confirmation banner */}
          {isConfirmingDelete && (
            <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/30 shrink-0">
              <p className="text-sm text-red-400 font-medium mb-2">Delete this transfer?</p>
              <p className="text-xs text-d4l-dim mb-3">This action cannot be undone.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteTransfer(transfer.id)}
                  className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 transition-colors"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-1.5 bg-d4l-raised border border-d4l-border text-xs text-d4l-text2 rounded-lg hover:bg-d4l-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Branch direction */}
            <div className="bg-d4l-raised border border-d4l-border rounded-xl p-4">
              <div className="flex items-center gap-3 justify-center">
                <div className="text-center">
                  <p className="text-[11px] text-d4l-dim mb-0.5">From</p>
                  <p className="text-sm font-bold" style={{ color: fromB?.color }}>{fromB?.name}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-d4l-gold shrink-0" />
                <div className="text-center">
                  <p className="text-[11px] text-d4l-dim mb-0.5">To</p>
                  <p className="text-sm font-bold" style={{ color: toB?.color }}>{toB?.name}</p>
                </div>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-d4l-dim">Type</p>
                <StatusBadge label={getTypeBadge(transfer.type).label} color={getTypeBadge(transfer.type).color} />
              </div>
              <div>
                <p className="text-[11px] text-d4l-dim">Date</p>
                <p className="text-sm text-d4l-text">{formatDateTime(transfer.timestamp)}</p>
              </div>
              <div>
                <p className="text-[11px] text-d4l-dim">Submitted By</p>
                <p className="text-sm text-d4l-text">{transfer.submittedBy}</p>
              </div>
              <div>
                <p className="text-[11px] text-d4l-dim">Total Items</p>
                <p className="text-sm text-d4l-text font-bold">{transfer.items?.reduce((s, i) => s + i.quantity, 0)}</p>
              </div>
            </div>

            {/* Items */}
            <div>
              <h3 className="text-xs text-d4l-muted font-medium mb-2">Items Transferred</h3>
              <div className="space-y-1.5">
                {transfer.items?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-d4l-raised border border-d4l-border rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-d4l-text truncate">{item.name}</p>
                      {item.code && <p className="text-[11px] text-d4l-dim">{item.code}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-d4l-gold">{item.quantity}</p>
                      {item.unit && <p className="text-[10px] text-d4l-dim">{item.unit}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {transfer.notes && (
              <div>
                <h3 className="text-xs text-d4l-muted font-medium mb-1">Notes</h3>
                <p className="text-sm text-d4l-text2 bg-d4l-raised border border-d4l-border rounded-lg p-3">{transfer.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
    return createPortal(content, document.body);
  };

  // Mobile transfer card
  const TransferCard = ({ transfer }) => {
    const fromB = BRANCHES.find(b => b.id === transfer.fromBranch);
    const toB = BRANCHES.find(b => b.id === transfer.toBranch);
    const totalQty = transfer.items?.reduce((s, i) => s + i.quantity, 0) || 0;

    return (
      <div
        onClick={() => setSelectedTransfer(transfer)}
        className="w-full text-left bg-d4l-surface border border-d4l-border rounded-xl p-3 hover:border-d4l-gold/30 transition-all cursor-pointer"
      >
        {/* Top row: branches + arrow */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ color: fromB?.color, backgroundColor: fromB?.color + '15' }}>
            {fromB?.name}
          </span>
          <ArrowRight className="w-4 h-4 text-d4l-dim shrink-0" />
          <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ color: toB?.color, backgroundColor: toB?.color + '15' }}>
            {toB?.name}
          </span>
          <div className="ml-auto">
            <StatusBadge label={getTypeBadge(transfer.type).label} color={getTypeBadge(transfer.type).color} />
          </div>
        </div>

        {/* Items preview */}
        <div className="text-xs text-d4l-text2 mb-1.5 line-clamp-2">
          {transfer.items?.map(i => `${i.name} ×${i.quantity}`).join(', ')}
        </div>

        {/* Bottom row: meta */}
        <div className="flex items-center justify-between text-[11px] text-d4l-dim">
          <span>{formatDateTime(transfer.timestamp)}</span>
          <div className="flex items-center gap-2">
            <span>{totalQty} item{totalQty !== 1 ? 's' : ''} · {transfer.submittedBy}</span>
            {isAdmin && (
              deleteConfirmId === transfer.id ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTransfer(transfer.id); }}
                    className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-bold rounded hover:bg-red-500 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                    className="px-2 py-0.5 bg-d4l-raised border border-d4l-border text-[11px] text-d4l-text2 rounded hover:bg-d4l-hover transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(transfer.id); }}
                  className="p-1 rounded hover:bg-red-500/15 text-d4l-dim hover:text-red-400 transition-colors"
                  title="Delete transfer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`${isMobile ? 'px-3 py-4 pb-28' : 'p-6'} max-w-6xl mx-auto`}>
      {/* Header */}
      <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'} mb-5`}>
        <div>
          <h1 className="text-2xl font-bold text-d4l-text font-[Bebas_Neue] tracking-wider flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-d4l-gold" />
            Branch Transfers
          </h1>
          <p className="text-sm text-d4l-muted mt-0.5">Track stock transfers between branches</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            className="flex items-center gap-1.5 px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-xs text-d4l-text2 hover:border-d4l-gold/30 transition-all"
            title="Export PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            {!isMobile && 'PDF'}
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-xs text-d4l-text2 hover:border-d4l-gold/30 transition-all"
            title="Export Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {!isMobile && 'Excel'}
          </button>
          <button
            onClick={() => setShowNewTransfer(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-d4l-gold text-black rounded-lg text-sm font-bold hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Transfer
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3 mb-5`}>
        <StatCard icon={Truck} label="Today" value={stats.today} color="green" subtitle="transfers today" />
        <StatCard icon={ArrowRightLeft} label="This Month" value={stats.month} color="blue" subtitle="monthly transfers" />
        <StatCard icon={Package} label="Items Moved" value={stats.totalItems} color="purple" subtitle="this month" />
        <StatCard icon={History} label="All Time" value={stats.total} color="amber" subtitle="total transfers" />
      </div>

      {/* Filters */}
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-3 mb-4`}>
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-d4l-dim" />
          <input
            type="text"
            placeholder="Search transfers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/50"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Branch filter */}
          <select
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
            className="px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/50"
          >
            <option value="all">All Branches</option>
            {BRANCHES.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/50"
          >
            <option value="all">All Types</option>
            <option value="vials">Vials</option>
            <option value="consumables">Consumables</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      </div>

      {/* Transfer list */}
      {filteredTransfers.length === 0 ? (
        <div className="text-center py-16 bg-d4l-surface border border-d4l-border rounded-xl">
          <ArrowRightLeft className="w-12 h-12 text-d4l-dim mx-auto mb-3" />
          <p className="text-d4l-muted text-sm">No transfers recorded yet</p>
          <p className="text-d4l-dim text-xs mt-1">Click "New Transfer" to log a stock transfer between branches</p>
        </div>
      ) : isMobile ? (
        /* Mobile: card layout */
        <div className="space-y-2">
          {filteredTransfers.map(transfer => (
            <TransferCard key={transfer.id} transfer={transfer} />
          ))}
        </div>
      ) : (
        /* Desktop: table layout */
        <div className="bg-d4l-surface border border-d4l-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-d4l-border bg-d4l-raised/50">
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">Date</th>
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">Type</th>
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">From</th>
                <th className="text-center text-xs text-d4l-muted font-medium px-2 py-3"></th>
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">To</th>
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">Items</th>
                <th className="text-center text-xs text-d4l-muted font-medium px-4 py-3">Qty</th>
                <th className="text-left text-xs text-d4l-muted font-medium px-4 py-3">By</th>
                {isAdmin && <th className="text-center text-xs text-d4l-muted font-medium px-2 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.map(transfer => {
                const fromB = BRANCHES.find(b => b.id === transfer.fromBranch);
                const toB = BRANCHES.find(b => b.id === transfer.toBranch);
                const totalQty = transfer.items?.reduce((s, i) => s + i.quantity, 0) || 0;

                return (
                  <tr
                    key={transfer.id}
                    onClick={() => setSelectedTransfer(transfer)}
                    className="border-b border-d4l-border/50 hover:bg-d4l-hover/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm text-d4l-text">{formatDate(transfer.timestamp)}</p>
                      <p className="text-[11px] text-d4l-dim">{new Date(transfer.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={getTypeBadge(transfer.type).label}
                        color={getTypeBadge(transfer.type).color}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: fromB?.color }}>{fromB?.name}</span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <ArrowRight className="w-4 h-4 text-d4l-dim inline-block" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: toB?.color }}>{toB?.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-d4l-text2 max-w-[200px] truncate">
                        {transfer.items?.map(i => i.name).join(', ')}
                      </p>
                      {transfer.notes && (
                        <p className="text-[11px] text-d4l-dim truncate max-w-[200px]">{transfer.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-d4l-gold">{totalQty}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-d4l-text2">{transfer.submittedBy}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-3 text-center">
                        {deleteConfirmId === transfer.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTransfer(transfer.id); }}
                              className="px-2 py-1 bg-red-600 text-white text-[11px] font-bold rounded hover:bg-red-500 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                              className="px-2 py-1 bg-d4l-raised border border-d4l-border text-[11px] text-d4l-text2 rounded hover:bg-d4l-hover transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(transfer.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-d4l-dim hover:text-red-400 transition-colors"
                            title="Delete transfer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Transfer Modal */}
      {showNewTransfer && (
        <NewTransferModal
          onClose={() => setShowNewTransfer(false)}
          onSubmit={handleNewTransfer}
          vialStock={vialStock}
          consumablesStock={consumablesStock}
          staffName={staffName}
          isMobile={isMobile}
        />
      )}

      {/* Transfer Detail Modal */}
      {selectedTransfer && (
        <TransferDetailModal
          transfer={selectedTransfer}
          onClose={() => setSelectedTransfer(null)}
        />
      )}
    </div>
  );
}
