import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BRANCHES } from '../data/initialData';
import { DEFAULT_CONSUMABLES } from '../data/defaultConsumables';
import { useIsMobile } from './Sidebar';
import {
  ShoppingCart, AlertTriangle, Plus, Trash2, History, ChevronLeft,
  FileSpreadsheet, FileText, X, Edit3, Save, Search, Minus,
  CheckCircle2, CircleAlert
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

function getStockStatus(quantity, minQty) {
  if (quantity === 0 || quantity === '') return { label: 'Out of Stock', color: 'red' };
  if (quantity < minQty) return { label: 'Low Stock', color: 'amber' };
  return { label: 'In Stock', color: 'green' };
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ label, color, large }) {
  const colorMap = {
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    gray: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full font-medium border ${colorMap[color] || colorMap.gray} ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`}>
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color, subtitle }) {
  const borderColors = {
    red: 'border-l-red-500',
    amber: 'border-l-amber-500',
    green: 'border-l-green-500',
    blue: 'border-l-blue-500',
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

function getTodayReport(history, branchId) {
  const today = new Date().toISOString().split('T')[0];
  return history
    .filter(h => h.branchId === branchId && h.action === 'report' && h.date === today)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
}

// ── Mobile Edit Modal ─────────────────────────────────────────────
function MobileEditModal({ item, editData, setEditData, onSave, onCancel }) {
  return (
    <div className="fixed inset-0 z-[200] bg-d4l-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-d4l-border bg-d4l-surface">
        <button onClick={onCancel} className="p-2 -ml-2 rounded-xl text-d4l-muted active:bg-d4l-hover">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-d4l-text truncate">{item.name}</h2>
          <p className="text-xs text-d4l-muted">{item.code} · {item.unit}</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Quantity with stepper */}
        <div>
          <label className="block text-sm font-medium text-d4l-text2 mb-2">
            Quantity <span className="text-d4l-dim font-normal">({item.unit})</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditData({ ...editData, quantity: Math.max(0, (Number(editData.quantity) || 0) - 1) })}
              className="w-14 h-14 shrink-0 flex items-center justify-center bg-d4l-surface border border-d4l-border rounded-xl text-d4l-text active:bg-d4l-hover"
            >
              <Minus className="w-6 h-6" />
            </button>
            <input
              type="number"
              min="0"
              value={editData.quantity}
              onChange={e => setEditData({ ...editData, quantity: e.target.value })}
              className="flex-1 min-w-0 px-4 py-4 bg-d4l-surface border border-d4l-border rounded-xl text-2xl text-d4l-text text-center font-bold focus:border-d4l-gold/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setEditData({ ...editData, quantity: (Number(editData.quantity) || 0) + 1 })}
              className="w-14 h-14 shrink-0 flex items-center justify-center bg-d4l-surface border border-d4l-border rounded-xl text-d4l-text active:bg-d4l-hover"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Info display */}
        <div className="bg-d4l-surface border border-d4l-border rounded-xl p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-d4l-dim">Product Code</span>
            <span className="text-sm text-d4l-text font-medium">{item.code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-d4l-dim">Unit</span>
            <span className="text-sm text-d4l-text font-medium">{item.unit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-d4l-dim">Min Required</span>
            <span className="text-sm text-d4l-text font-medium">{item.minQty}</span>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-4 py-4 border-t border-d4l-border bg-d4l-surface flex gap-3 safe-area-bottom">
        <button onClick={onCancel} className="flex-1 px-4 py-4 bg-d4l-hover text-d4l-text2 rounded-xl text-base font-medium active:bg-d4l-active">
          Cancel
        </button>
        <button onClick={onSave} className="flex-1 px-4 py-4 bg-d4l-gold text-d4l-bg rounded-xl text-base font-bold active:brightness-90 flex items-center justify-center gap-2">
          <Save className="w-5 h-5" /> Save
        </button>
      </div>
    </div>
  );
}

// ── Mobile Item Card ──────────────────────────────────────────────
function MobileItemCard({ item, onEdit, isAdmin, onRemove }) {
  const borderColorMap = {
    red: 'border-l-red-500 bg-red-500/5',
    amber: 'border-l-amber-500',
    green: 'border-l-green-500',
    gray: 'border-l-neutral-500',
  };

  return (
    <div className={`bg-d4l-surface border border-d4l-border rounded-xl p-4 border-l-4 ${borderColorMap[item.stockStatus.color] || 'border-l-d4l-border'}`}>
      {/* Top: Name + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-d4l-text leading-tight">{item.name}</h3>
          <p className="text-xs text-d4l-dim mt-0.5">{item.code}</p>
        </div>
        <div className="shrink-0">
          {item.stockStatus.color !== 'green' && (
            <StatusBadge label={item.stockStatus.label} color={item.stockStatus.color} large />
          )}
        </div>
      </div>

      {/* Quantity display */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl font-bold ${(Number(item.quantity) || 0) < item.minQty ? 'text-amber-400' : 'text-d4l-text'}`}>
          {item.quantity ?? '—'}
        </span>
        <span className="text-sm text-d4l-dim">/ {item.minQty} {item.unit}</span>
      </div>

      {/* Last updated + Edit button */}
      <div className="flex items-center justify-between pt-2 border-t border-d4l-border/50">
        <div>
          {item.lastUpdated ? (
            <p className="text-[11px] text-d4l-dim">{formatDate(item.lastUpdated)} · {item.updatedBy || ''}</p>
          ) : (
            <p className="text-[11px] text-d4l-dim">Not yet recorded</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={onRemove} className="p-2.5 rounded-xl text-d4l-dim active:text-red-400 active:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2.5 bg-d4l-gold/10 border border-d4l-gold/30 rounded-xl text-sm font-semibold text-d4l-gold active:bg-d4l-gold/20"
          >
            <Edit3 className="w-4 h-4" /> Count
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConsumablesStockReport({ consumablesStock, setConsumablesStock, userRole, currentUser, staffName }) {
  const isAdmin = userRole === 'admin';
  const isMobile = useIsMobile();
  const [selectedBranch, setSelectedBranch] = useState(BRANCHES[0].id);
  const [editingRow, setEditingRow] = useState(null);
  const [editData, setEditData] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('pieces');
  const [newItemMinQty, setNewItemMinQty] = useState(5);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const items = consumablesStock?.items || DEFAULT_CONSUMABLES;
  const stock = consumablesStock?.stock || {};
  const history = consumablesStock?.history || [];
  const branchStock = stock[selectedBranch] || {};

  const stats = useMemo(() => {
    let total = items.length;
    let lowStock = 0;
    let outOfStock = 0;
    let inStock = 0;

    items.forEach(item => {
      const entry = branchStock[item.id];
      const qty = entry ? Number(entry.quantity) || 0 : 0;
      if (qty === 0) outOfStock++;
      else if (qty < item.minQty) lowStock++;
      else inStock++;
    });

    return { total, lowStock, outOfStock, inStock };
  }, [items, branchStock]);

  const displayItems = useMemo(() => {
    let filtered = items.map(item => {
      const entry = branchStock[item.id] || {};
      const stkStatus = getStockStatus(Number(entry.quantity) || 0, item.minQty);
      return { ...item, ...entry, quantity: entry.quantity, stockStatus: stkStatus };
    });

    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(v => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q));
    }

    if (statusFilter === 'out') filtered = filtered.filter(v => v.stockStatus.color === 'red');
    else if (statusFilter === 'low') filtered = filtered.filter(v => v.stockStatus.color === 'amber');
    else if (statusFilter === 'ok') filtered = filtered.filter(v => v.stockStatus.color === 'green');

    filtered.sort((a, b) => {
      const priority = { red: 1, amber: 2, green: 3 };
      return (priority[a.stockStatus.color] || 4) - (priority[b.stockStatus.color] || 4);
    });

    return filtered;
  }, [items, branchStock, searchFilter, statusFilter]);

  const branchHistory = useMemo(() => {
    return history.filter(h => h.branchId === selectedBranch).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [history, selectedBranch]);

  function startEdit(itemId) {
    const entry = branchStock[itemId] || {};
    setEditingRow(itemId);
    setEditData({ quantity: entry.quantity ?? '' });
  }

  function saveEdit(itemId) {
    const now = new Date().toISOString().split('T')[0];
    const userName = staffName || currentUser?.email?.split('@')[0] || 'Unknown';

    const updatedStock = {
      ...stock,
      [selectedBranch]: {
        ...branchStock,
        [itemId]: {
          quantity: Number(editData.quantity) || 0,
          lastUpdated: now,
          updatedBy: userName,
        }
      }
    };

    setConsumablesStock({
      ...consumablesStock,
      items,
      stock: updatedStock,
      history: [...history, {
        id: `log-${Date.now()}`,
        branchId: selectedBranch,
        date: now,
        submittedBy: userName,
        itemId,
        itemName: items.find(v => v.id === itemId)?.name || itemId,
        action: branchStock[itemId] ? 'update' : 'add',
        previousQty: branchStock[itemId]?.quantity ?? null,
        newQty: Number(editData.quantity) || 0,
        timestamp: new Date().toISOString(),
      }],
    });

    setEditingRow(null);
    setEditData({});
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditData({});
  }

  function submitFullReport() {
    const now = new Date().toISOString().split('T')[0];
    const userName = staffName || currentUser?.email?.split('@')[0] || 'Unknown';

    const reportItems = {};
    items.forEach(item => {
      const entry = branchStock[item.id];
      if (entry) {
        reportItems[item.id] = { quantity: Number(entry.quantity) || 0 };
      }
    });

    setConsumablesStock({
      ...consumablesStock,
      items,
      stock,
      history: [...history, {
        id: `rpt-${Date.now()}`,
        branchId: selectedBranch,
        date: now,
        submittedBy: userName,
        action: 'report',
        reportItems,
        timestamp: new Date().toISOString(),
      }],
    });

    setConfirmSubmit(false);
  }

  function addItem() {
    if (!newItemName.trim()) return;
    const id = newItemName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    if (items.some(v => v.id === id)) return;

    setConsumablesStock({
      ...consumablesStock,
      items: [...items, {
        id,
        name: newItemName.trim(),
        code: newItemCode.trim().toUpperCase() || 'PS000',
        unit: newItemUnit || 'pieces',
        minQty: Number(newItemMinQty) || 5,
      }],
      stock,
      history,
    });

    setNewItemName('');
    setNewItemCode('');
    setNewItemUnit('pieces');
    setNewItemMinQty(5);
    setShowAddItem(false);
  }

  function removeItem(itemId) {
    const updatedItems = items.filter(v => v.id !== itemId);
    const updatedStock = { ...stock };
    Object.keys(updatedStock).forEach(branchId => {
      if (updatedStock[branchId]?.[itemId]) {
        const branchCopy = { ...updatedStock[branchId] };
        delete branchCopy[itemId];
        updatedStock[branchId] = branchCopy;
      }
    });

    setConsumablesStock({
      ...consumablesStock,
      items: updatedItems,
      stock: updatedStock,
      history,
    });
  }

  function updateMinQty(itemId, newMin) {
    const updatedItems = items.map(v => v.id === itemId ? { ...v, minQty: Number(newMin) || 1 } : v);
    setConsumablesStock({ ...consumablesStock, items: updatedItems, stock, history });
  }

  // PDF Export
  function exportPdf() {
    const doc = new jsPDF();
    const branch = BRANCHES.find(b => b.id === selectedBranch);
    const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFillColor(8, 8, 8);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(232, 232, 0);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('DRIP4LIFE', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(200, 192, 168);
    doc.text('IV NUTRIENT THERAPY — Stock Take Report', 14, 26);
    doc.setTextColor(232, 232, 0);
    doc.text(branch?.name || selectedBranch, 196, 18, { align: 'right' });
    doc.setTextColor(200, 192, 168);
    doc.text(today, 196, 26, { align: 'right' });

    const rows = items.map(item => {
      const entry = branchStock[item.id] || {};
      const stkStatus = getStockStatus(Number(entry.quantity) || 0, item.minQty);
      return [
        item.name,
        item.code,
        entry.quantity ?? '—',
        item.unit,
        item.minQty,
        stkStatus.label,
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Product Name', 'Code', 'Qty', 'Unit', 'Min', 'Status']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 26], textColor: [232, 232, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [20, 20, 18] },
      columnStyles: { 0: { cellWidth: 55 }, 2: { halign: 'center' }, 4: { halign: 'center' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const text = data.cell.text[0] || '';
          if (text.includes('Out')) data.cell.styles.textColor = [239, 68, 68];
          else if (text.includes('Low')) data.cell.styles.textColor = [249, 115, 22];
        }
      },
    });

    doc.save(`Drip4Life_StockTake_${branch?.name || selectedBranch}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // Excel Export
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const branch = BRANCHES.find(b => b.id === selectedBranch);

    const headerStyle = {
      font: { bold: true, color: { rgb: 'E8E800' }, sz: 11 },
      fill: { fgColor: { rgb: '1E1E1A' } },
      border: { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'medium', color: { rgb: '000000' } }, left: { style: 'medium', color: { rgb: '000000' } }, right: { style: 'medium', color: { rgb: '000000' } } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const cellStyle = {
      border: { top: { style: 'thin', color: { rgb: '333333' } }, bottom: { style: 'thin', color: { rgb: '333333' } }, left: { style: 'thin', color: { rgb: '333333' } }, right: { style: 'thin', color: { rgb: '333333' } } },
      alignment: { vertical: 'center' },
    };

    const rows = [[
      { v: 'Product Name', s: headerStyle }, { v: 'Product Code', s: headerStyle },
      { v: 'Quantity', s: headerStyle }, { v: 'Unit', s: headerStyle },
      { v: 'Min Qty', s: headerStyle }, { v: 'Status', s: headerStyle },
      { v: 'Last Updated', s: headerStyle }, { v: 'Updated By', s: headerStyle },
    ]];

    items.forEach(item => {
      const entry = branchStock[item.id] || {};
      const stkStatus = getStockStatus(Number(entry.quantity) || 0, item.minQty);
      const statusColor = stkStatus.color === 'red' ? 'EF4444' : stkStatus.color === 'amber' ? 'F97316' : '22C55E';

      rows.push([
        { v: item.name, s: cellStyle }, { v: item.code, s: cellStyle },
        { v: Number(entry.quantity) || 0, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
        { v: item.unit, s: cellStyle },
        { v: item.minQty, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
        { v: stkStatus.label, s: { ...cellStyle, font: { color: { rgb: statusColor } } } },
        { v: entry.lastUpdated || '', s: cellStyle }, { v: entry.updatedBy || '', s: cellStyle },
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, branch?.name || selectedBranch);

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `Drip4Life_StockTake_${branch?.name || selectedBranch}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const selectedBranchData = BRANCHES.find(b => b.id === selectedBranch);
  const editingItem = editingRow ? items.find(v => v.id === editingRow) : null;

  return (
    <>
    {/* Mobile Edit Modal via portal */}
    {isMobile && editingItem && createPortal(
      <MobileEditModal
        item={editingItem}
        editData={editData}
        setEditData={setEditData}
        onSave={() => saveEdit(editingRow)}
        onCancel={cancelEdit}
      />,
      document.body
    )}
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-d4l-text font-[Bebas_Neue] tracking-wider flex items-center gap-3">
            <ShoppingCart className="w-7 h-7 text-d4l-gold" />
            Stock Take Report
          </h1>
          {!isMobile && <p className="text-sm text-d4l-muted mt-1">Track consumables and supplies inventory per branch</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportPdf} className="flex items-center gap-1.5 px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text2 hover:border-d4l-gold/30 transition-colors">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text2 hover:border-d4l-gold/30 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${showHistory ? 'bg-d4l-gold/10 border-d4l-gold/40 text-d4l-gold' : 'bg-d4l-surface border-d4l-border text-d4l-text2 hover:border-d4l-gold/30'}`}>
            <History className="w-4 h-4" /> History
          </button>
        </div>
      </div>

      {/* Branch Tabs */}
      <div className={`flex gap-1.5 mb-5 overflow-x-auto pb-1 ${isMobile ? '-mx-4 px-4' : ''}`}>
        {BRANCHES.map(branch => {
          const branchSubmitted = !!getTodayReport(history, branch.id);
          return (
            <button
              key={branch.id}
              onClick={() => { setSelectedBranch(branch.id); setEditingRow(null); }}
              className={`rounded-lg font-medium whitespace-nowrap transition-all relative ${
                isMobile ? 'px-4 py-3 text-sm flex-1 min-w-0' : 'px-4 py-2 text-sm'
              } ${
                selectedBranch === branch.id
                  ? 'text-white shadow-lg'
                  : 'bg-d4l-surface border border-d4l-border text-d4l-muted hover:text-d4l-text2'
              }`}
              style={selectedBranch === branch.id ? { backgroundColor: branch.color, boxShadow: `0 4px 12px ${branch.color}33` } : undefined}
            >
              {isMobile ? branch.name.split(' ')[0] : branch.name}
              {branchSubmitted && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-d4l-bg flex items-center justify-center">
                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Daily Submission Status */}
      {(() => {
        const todayReport = getTodayReport(history, selectedBranch);
        const submitted = !!todayReport;
        return (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border ${
            submitted ? 'bg-green-500/8 border-green-500/25' : 'bg-amber-500/8 border-amber-500/25'
          }`}>
            {submitted ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            ) : (
              <CircleAlert className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {submitted ? (
                <p className="text-sm text-green-300 font-medium">
                  Today's stock take submitted
                  <span className="text-green-400/60 font-normal"> — by {todayReport.submittedBy} at {new Date(todayReport.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
              ) : (
                <p className="text-sm text-amber-300 font-medium">
                  Daily stock take not yet submitted
                  <span className="text-amber-400/60 font-normal"> — {selectedBranchData?.name}</span>
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={ShoppingCart} label="Total Items" value={stats.total} color="blue" subtitle={!isMobile ? `Tracked at ${selectedBranchData?.name}` : undefined} />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats.lowStock} color="amber" subtitle={stats.lowStock > 0 ? 'Below minimum' : 'OK'} />
        <StatCard icon={AlertTriangle} label="Out of Stock" value={stats.outOfStock} color="red" subtitle={stats.outOfStock > 0 ? 'Needs restock' : 'All stocked'} />
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-d4l-surface border border-d4l-border rounded-xl p-4 mb-5">
          <h3 className="text-sm font-semibold text-d4l-text mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-d4l-gold" />
            Stock Take History — {selectedBranchData?.name}
          </h3>
          {branchHistory.length === 0 ? (
            <p className="text-sm text-d4l-dim py-4 text-center">No history yet for this branch</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {branchHistory.slice(0, 50).map(entry => (
                <div key={entry.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-d4l-raised/50 text-sm">
                  <div className="shrink-0 mt-0.5">
                    {entry.action === 'report' ? (
                      <div className="w-6 h-6 rounded-full bg-d4l-gold/15 flex items-center justify-center">
                        <FileText className="w-3 h-3 text-d4l-gold" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
                        <Edit3 className="w-3 h-3 text-blue-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-d4l-text2">
                      {entry.action === 'report' ? (
                        <span>Full stock take submitted</span>
                      ) : (
                        <span>
                          Updated <span className="text-d4l-gold">{entry.itemName}</span>
                          {entry.previousQty !== null && <span className="text-d4l-dim"> — qty {entry.previousQty} → {entry.newQty}</span>}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-d4l-dim">
                      {entry.submittedBy} · {formatDate(entry.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-d4l-dim" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className={`w-full pl-9 pr-3 bg-d4l-surface border border-d4l-border rounded-lg text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none transition-colors ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'}`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'out', 'low', 'ok'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-lg font-medium transition-colors ${
                isMobile ? 'px-3 py-2.5 text-sm flex-1' : 'px-3 py-2 text-xs'
              } ${
                statusFilter === f
                  ? 'bg-d4l-gold/15 border border-d4l-gold/40 text-d4l-gold'
                  : 'bg-d4l-surface border border-d4l-border text-d4l-muted hover:text-d4l-text2'
              }`}
            >
              {f === 'all' ? 'All' : f === 'out' ? 'Out of Stock' : f === 'low' ? 'Low Stock' : 'In Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MOBILE: Card Layout ───────────────────────────────────── */}
      {isMobile ? (
        <div className="space-y-3 mb-6">
          {displayItems.length === 0 ? (
            <div className="text-center py-8 text-d4l-dim bg-d4l-surface border border-d4l-border rounded-xl">
              {searchFilter || statusFilter !== 'all' ? 'No items match your filter' : 'No items configured'}
            </div>
          ) : (
            displayItems.map(item => (
              <MobileItemCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onEdit={() => startEdit(item.id)}
                onRemove={() => removeItem(item.id)}
              />
            ))
          )}
        </div>
      ) : (
        /* ── DESKTOP: Table Layout ──────────────────────────────────── */
        <div className="bg-d4l-surface border border-d4l-border rounded-xl overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-d4l-border bg-d4l-raised/50">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Product Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Code</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Qty</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Unit</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Min</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Last Updated</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-d4l-dim">
                      {searchFilter || statusFilter !== 'all' ? 'No items match your filter' : 'No items configured'}
                    </td>
                  </tr>
                ) : (
                  displayItems.map(item => {
                    const isEditing = editingRow === item.id;
                    const borderColor = item.stockStatus.color === 'red' ? 'border-l-red-500'
                      : item.stockStatus.color === 'amber' ? 'border-l-amber-500'
                      : 'border-l-transparent';

                    return (
                      <tr key={item.id} className={`border-b border-d4l-border/50 hover:bg-d4l-raised/30 transition-colors border-l-4 ${borderColor}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-d4l-text">{item.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-d4l-dim font-mono text-xs">{item.code}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <input type="number" min="0" value={editData.quantity} onChange={e => setEditData({ ...editData, quantity: e.target.value })}
                              className="w-20 px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text text-center focus:border-d4l-gold/40 focus:outline-none" />
                          ) : (
                            <span className={`font-medium ${(Number(item.quantity) || 0) < item.minQty ? 'text-amber-400' : 'text-d4l-text'}`}>
                              {item.quantity ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-d4l-text2 text-xs">{item.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isAdmin ? (
                            <input type="number" min="0" value={item.minQty} onChange={e => updateMinQty(item.id, e.target.value)}
                              className="w-16 px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text text-center focus:border-d4l-gold/40 focus:outline-none" />
                          ) : (
                            <span className="text-d4l-text2">{item.minQty}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.stockStatus.color !== 'green' && (
                            <StatusBadge label={item.stockStatus.label} color={item.stockStatus.color} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-d4l-dim text-xs">{item.lastUpdated ? formatDate(item.lastUpdated) : '—'}</span>
                            {item.updatedBy && <span className="block text-[10px] text-d4l-dim">{item.updatedBy}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(item.id)} className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" title="Save">
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={cancelEdit} className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" title="Cancel">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(item.id)} className="p-1.5 rounded-lg text-d4l-dim hover:text-d4l-gold hover:bg-d4l-gold/10 transition-colors" title="Edit">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button onClick={() => removeItem(item.id)} className="p-1.5 rounded-lg text-d4l-dim hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove item">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className={`flex gap-3 ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'}`}>
        {isAdmin && (
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className={`flex items-center justify-center gap-2 bg-d4l-surface border border-d4l-border rounded-xl text-d4l-text2 hover:border-d4l-gold/30 transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2.5 text-sm'}`}
          >
            <Plus className="w-5 h-5" /> Add Item
          </button>
        )}
        <button
          onClick={() => setConfirmSubmit(true)}
          className={`flex items-center justify-center gap-2 rounded-xl font-bold transition-all ${isMobile ? 'px-6 py-4 text-base' : 'px-6 py-2.5 text-sm font-semibold'}`}
          style={{ backgroundColor: selectedBranchData?.color || '#e8e800', color: '#080808' }}
        >
          <Save className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} /> Submit Stock Take
        </button>
      </div>

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setShowAddItem(false)}>
          <div className={`bg-d4l-surface border border-d4l-border w-full ${isMobile ? 'rounded-t-2xl p-5 pb-8' : 'rounded-2xl p-6 max-w-sm'}`} onClick={e => e.stopPropagation()}>
            {isMobile && <div className="w-10 h-1 bg-d4l-hover rounded-full mx-auto mb-4" />}
            <h3 className={`font-bold text-d4l-text font-[Bebas_Neue] tracking-wide mb-4 ${isMobile ? 'text-xl' : 'text-lg'}`}>Add New Item</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-d4l-muted mb-1.5">Product Name</label>
                <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Bandages"
                  className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-d4l-muted mb-1.5">Product Code</label>
                  <input type="text" value={newItemCode} onChange={e => setNewItemCode(e.target.value)} placeholder="PS000"
                    className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`} />
                </div>
                <div>
                  <label className="block text-sm text-d4l-muted mb-1.5">Unit</label>
                  <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
                    className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`}>
                    <option value="pieces">pieces</option>
                    <option value="boxes">boxes</option>
                    <option value="pack">pack</option>
                    <option value="rolls">rolls</option>
                    <option value="bags">bags</option>
                    <option value="vials">vials</option>
                    <option value="tablets">tablets</option>
                    <option value="units">units</option>
                    <option value="unit">unit</option>
                    <option value="bottle">bottle</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-d4l-muted mb-1.5">Minimum Quantity</label>
                <input type="number" min="1" value={newItemMinQty} onChange={e => setNewItemMinQty(e.target.value)}
                  className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddItem(false)} className={`flex-1 bg-d4l-hover text-d4l-text2 rounded-xl hover:bg-d4l-active transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm'}`}>
                  Cancel
                </button>
                <button onClick={addItem} className={`flex-1 bg-d4l-gold text-d4l-bg rounded-xl font-bold hover:brightness-110 transition-all ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm font-semibold'}`}>
                  Add Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setConfirmSubmit(false)}>
          <div className={`bg-d4l-surface border border-d4l-border w-full ${isMobile ? 'rounded-t-2xl p-5 pb-8' : 'rounded-2xl p-6 max-w-sm'}`} onClick={e => e.stopPropagation()}>
            {isMobile && <div className="w-10 h-1 bg-d4l-hover rounded-full mx-auto mb-4" />}
            <h3 className={`font-bold text-d4l-text font-[Bebas_Neue] tracking-wide mb-2 ${isMobile ? 'text-xl' : 'text-lg'}`}>Submit Stock Take</h3>
            <p className={`text-d4l-muted mb-5 ${isMobile ? 'text-base' : 'text-sm'}`}>
              This will log a complete stock take for <span className="text-d4l-text font-medium">{selectedBranchData?.name}</span>. Continue?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSubmit(false)} className={`flex-1 bg-d4l-hover text-d4l-text2 rounded-xl hover:bg-d4l-active transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm'}`}>
                Cancel
              </button>
              <button onClick={submitFullReport} className={`flex-1 bg-d4l-gold text-d4l-bg rounded-xl font-bold hover:brightness-110 transition-all ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm font-semibold'}`}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
