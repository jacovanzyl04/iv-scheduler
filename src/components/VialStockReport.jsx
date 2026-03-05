import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BRANCHES } from '../data/initialData';
import { DEFAULT_VIALS } from '../data/defaultVials';
import { useIsMobile } from './Sidebar';
import {
  Package, AlertTriangle, AlertCircle, Clock,
  Plus, Trash2, History, ChevronLeft,
  FileSpreadsheet, FileText, X, Edit3, Save, Search, Minus,
  CheckCircle2, CircleAlert
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return { label: 'No Date', color: 'gray', priority: 5 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Expired', color: 'red', priority: 1, days: diffDays };
  if (diffDays <= 30) return { label: 'Expiring Soon', color: 'orange', priority: 2, days: diffDays };
  if (diffDays <= 60) return { label: 'Check Soon', color: 'amber', priority: 3, days: diffDays };
  return { label: 'OK', color: 'green', priority: 4, days: diffDays };
}

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
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
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
    orange: 'border-l-orange-500',
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

// Check if a stock report was submitted today for a given branch
function getTodayReport(history, branchId) {
  const today = new Date().toISOString().split('T')[0];
  return history
    .filter(h => h.branchId === branchId && h.action === 'report' && h.date === today)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
}

// ── Mobile Edit Modal ─────────────────────────────────────────────
function MobileEditModal({ vial, editData, setEditData, onSave, onCancel }) {
  return (
    <div className="fixed inset-0 z-[200] bg-d4l-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-d4l-border bg-d4l-surface">
        <button onClick={onCancel} className="p-2 -ml-2 rounded-xl text-d4l-muted active:bg-d4l-hover">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-d4l-text truncate">{vial.name}</h2>
          <p className="text-xs text-d4l-muted">Update stock information</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Batch Number */}
        <div>
          <label className="block text-sm font-medium text-d4l-text2 mb-2">Batch Number</label>
          <input
            type="text"
            value={editData.batchNumber}
            onChange={e => setEditData({ ...editData, batchNumber: e.target.value })}
            placeholder="Enter batch number"
            className="w-full px-4 py-4 bg-d4l-surface border border-d4l-border rounded-xl text-base text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none"
          />
        </div>

        {/* Expiry Date */}
        <div>
          <label className="block text-sm font-medium text-d4l-text2 mb-2">Expiry Date</label>
          <input
            type="date"
            value={editData.expiryDate}
            onChange={e => setEditData({ ...editData, expiryDate: e.target.value })}
            className="w-full px-4 py-4 bg-d4l-surface border border-d4l-border rounded-xl text-base text-d4l-text focus:border-d4l-gold/40 focus:outline-none"
          />
        </div>

        {/* Quantity with stepper */}
        <div>
          <label className="block text-sm font-medium text-d4l-text2 mb-2">Quantity</label>
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

// ── Mobile Vial Card ──────────────────────────────────────────────
function MobileVialCard({ vial, onEdit, isAdmin, onRemove }) {
  const borderColorMap = {
    red: 'border-l-red-500 bg-red-500/5',
    orange: 'border-l-orange-500 bg-orange-500/5',
    amber: 'border-l-amber-500',
    green: 'border-l-green-500',
    gray: 'border-l-neutral-500',
  };
  const worstColor = vial.expiryStatus.priority < (vial.stockStatus.color === 'red' ? 1 : vial.stockStatus.color === 'amber' ? 3 : 5)
    ? vial.expiryStatus.color
    : vial.stockStatus.color;

  return (
    <div className={`bg-d4l-surface border border-d4l-border rounded-xl p-4 border-l-4 ${borderColorMap[worstColor] || 'border-l-d4l-border'}`}>
      {/* Top: Name + Status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-bold text-d4l-text leading-tight">{vial.name}</h3>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge label={vial.expiryStatus.label} color={vial.expiryStatus.color} large />
          {vial.stockStatus.color !== 'green' && (
            <StatusBadge label={vial.stockStatus.label} color={vial.stockStatus.color} large />
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[11px] text-d4l-dim uppercase tracking-wider mb-0.5">Batch</p>
          <p className="text-sm text-d4l-text2 font-medium">{vial.batchNumber || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-d4l-dim uppercase tracking-wider mb-0.5">Expiry</p>
          <p className="text-sm text-d4l-text2 font-medium">{formatDate(vial.expiryDate)}</p>
          {vial.expiryStatus.days !== undefined && vial.expiryStatus.color !== 'green' && (
            <p className={`text-[11px] font-medium ${vial.expiryStatus.color === 'red' ? 'text-red-400' : 'text-orange-400'}`}>
              {vial.expiryStatus.days < 0 ? `${Math.abs(vial.expiryStatus.days)}d overdue` : `${vial.expiryStatus.days}d left`}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-d4l-dim uppercase tracking-wider mb-0.5">Qty</p>
          <p className={`text-lg font-bold ${(Number(vial.quantity) || 0) < vial.minQty ? 'text-amber-400' : 'text-d4l-text'}`}>
            {vial.quantity ?? '—'}
            <span className="text-[11px] text-d4l-dim font-normal"> / {vial.minQty}</span>
          </p>
        </div>
      </div>

      {/* Last updated + Edit button */}
      <div className="flex items-center justify-between pt-2 border-t border-d4l-border/50">
        <div>
          {vial.lastUpdated ? (
            <p className="text-[11px] text-d4l-dim">{formatDate(vial.lastUpdated)} · {vial.updatedBy || ''}</p>
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
            <Edit3 className="w-4 h-4" /> Update
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VialStockReport({ vialStock, setVialStock, userRole, currentUser, staffName }) {
  const isAdmin = userRole === 'admin';
  const isMobile = useIsMobile();
  const [selectedBranch, setSelectedBranch] = useState(BRANCHES[0].id);
  const [editingRow, setEditingRow] = useState(null);
  const [editData, setEditData] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showAddVial, setShowAddVial] = useState(false);
  const [newVialName, setNewVialName] = useState('');
  const [newVialMinQty, setNewVialMinQty] = useState(5);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Initialize vial list from stock data or defaults
  const vials = vialStock?.vials || DEFAULT_VIALS;
  const stock = vialStock?.stock || {};
  const history = vialStock?.history || [];
  const branchStock = stock[selectedBranch] || {};

  // Compute stats for selected branch
  const stats = useMemo(() => {
    let total = vials.length;
    let expired = 0;
    let expiringSoon = 0;
    let lowStock = 0;
    let outOfStock = 0;

    vials.forEach(vial => {
      const item = branchStock[vial.id];
      if (!item) {
        outOfStock++;
        return;
      }
      const expStatus = getExpiryStatus(item.expiryDate);
      if (expStatus.color === 'red') expired++;
      else if (expStatus.color === 'orange') expiringSoon++;

      const qty = Number(item.quantity) || 0;
      if (qty === 0) outOfStock++;
      else if (qty < vial.minQty) lowStock++;
    });

    return { total, expired, expiringSoon, lowStock, outOfStock };
  }, [vials, branchStock]);

  // Filtered and sorted vials for display
  const displayVials = useMemo(() => {
    let filtered = vials.map(vial => {
      const item = branchStock[vial.id] || {};
      const expStatus = getExpiryStatus(item.expiryDate);
      const stkStatus = getStockStatus(Number(item.quantity) || 0, vial.minQty);
      return { ...vial, ...item, expiryStatus: expStatus, stockStatus: stkStatus };
    });

    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(v => v.name.toLowerCase().includes(q) || (v.batchNumber || '').toLowerCase().includes(q));
    }

    if (statusFilter === 'expired') filtered = filtered.filter(v => v.expiryStatus.color === 'red');
    else if (statusFilter === 'expiring') filtered = filtered.filter(v => v.expiryStatus.color === 'orange' || v.expiryStatus.color === 'amber');
    else if (statusFilter === 'low') filtered = filtered.filter(v => v.stockStatus.color === 'amber' || v.stockStatus.color === 'red');

    filtered.sort((a, b) => {
      const aPriority = Math.min(a.expiryStatus.priority, a.stockStatus.color === 'red' ? 1 : a.stockStatus.color === 'amber' ? 2 : 5);
      const bPriority = Math.min(b.expiryStatus.priority, b.stockStatus.color === 'red' ? 1 : b.stockStatus.color === 'amber' ? 2 : 5);
      return aPriority - bPriority;
    });

    return filtered;
  }, [vials, branchStock, searchFilter, statusFilter]);

  // Branch history
  const branchHistory = useMemo(() => {
    return history.filter(h => h.branchId === selectedBranch).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [history, selectedBranch]);

  function startEdit(vialId) {
    const item = branchStock[vialId] || {};
    setEditingRow(vialId);
    setEditData({
      batchNumber: item.batchNumber || '',
      expiryDate: item.expiryDate || '',
      quantity: item.quantity ?? '',
    });
  }

  function saveEdit(vialId) {
    const now = new Date().toISOString().split('T')[0];
    const userName = staffName || currentUser?.email?.split('@')[0] || 'Unknown';

    const updatedStock = {
      ...stock,
      [selectedBranch]: {
        ...branchStock,
        [vialId]: {
          batchNumber: editData.batchNumber,
          expiryDate: editData.expiryDate,
          quantity: Number(editData.quantity) || 0,
          lastUpdated: now,
          updatedBy: userName,
        }
      }
    };

    setVialStock({
      ...vialStock,
      vials,
      stock: updatedStock,
      history: [...history, {
        id: `log-${Date.now()}`,
        branchId: selectedBranch,
        date: now,
        submittedBy: userName,
        vialId,
        vialName: vials.find(v => v.id === vialId)?.name || vialId,
        action: branchStock[vialId] ? 'update' : 'add',
        previousQty: branchStock[vialId]?.quantity ?? null,
        newQty: Number(editData.quantity) || 0,
        previousExpiry: branchStock[vialId]?.expiryDate || null,
        newExpiry: editData.expiryDate || null,
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
    vials.forEach(vial => {
      const item = branchStock[vial.id];
      if (item) {
        reportItems[vial.id] = {
          batchNumber: item.batchNumber || '',
          expiryDate: item.expiryDate || '',
          quantity: Number(item.quantity) || 0,
        };
      }
    });

    setVialStock({
      ...vialStock,
      vials,
      stock,
      history: [...history, {
        id: `rpt-${Date.now()}`,
        branchId: selectedBranch,
        date: now,
        submittedBy: userName,
        action: 'report',
        items: reportItems,
        timestamp: new Date().toISOString(),
      }],
    });

    setConfirmSubmit(false);
  }

  function addVial() {
    if (!newVialName.trim()) return;
    const id = newVialName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    if (vials.some(v => v.id === id)) return;

    setVialStock({
      ...vialStock,
      vials: [...vials, { id, name: newVialName.trim().toUpperCase(), minQty: Number(newVialMinQty) || 5 }],
      stock,
      history,
    });

    setNewVialName('');
    setNewVialMinQty(5);
    setShowAddVial(false);
  }

  function removeVial(vialId) {
    const updatedVials = vials.filter(v => v.id !== vialId);
    const updatedStock = { ...stock };
    Object.keys(updatedStock).forEach(branchId => {
      if (updatedStock[branchId]?.[vialId]) {
        const branchCopy = { ...updatedStock[branchId] };
        delete branchCopy[vialId];
        updatedStock[branchId] = branchCopy;
      }
    });

    setVialStock({
      ...vialStock,
      vials: updatedVials,
      stock: updatedStock,
      history,
    });
  }

  function updateMinQty(vialId, newMin) {
    const updatedVials = vials.map(v => v.id === vialId ? { ...v, minQty: Number(newMin) || 1 } : v);
    setVialStock({ ...vialStock, vials: updatedVials, stock, history });
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
    doc.text('IV NUTRIENT THERAPY — Vial Stock Report', 14, 26);
    doc.setTextColor(232, 232, 0);
    doc.text(branch?.name || selectedBranch, 196, 18, { align: 'right' });
    doc.setTextColor(200, 192, 168);
    doc.text(today, 196, 26, { align: 'right' });

    const rows = vials.map(vial => {
      const item = branchStock[vial.id] || {};
      const expStatus = getExpiryStatus(item.expiryDate);
      const stkStatus = getStockStatus(Number(item.quantity) || 0, vial.minQty);
      return [
        vial.name,
        item.batchNumber || '—',
        item.expiryDate ? formatDate(item.expiryDate) : '—',
        item.quantity ?? '—',
        vial.minQty,
        `${expStatus.label}${stkStatus.color !== 'green' ? ' / ' + stkStatus.label : ''}`,
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Vial Name', 'Batch #', 'Exp Date', 'Qty', 'Min', 'Status']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 26], textColor: [232, 232, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [20, 20, 18] },
      columnStyles: { 0: { cellWidth: 50 }, 3: { halign: 'center' }, 4: { halign: 'center' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const text = data.cell.text[0] || '';
          if (text.includes('Expired') || text.includes('Out of Stock')) data.cell.styles.textColor = [239, 68, 68];
          else if (text.includes('Expiring') || text.includes('Low')) data.cell.styles.textColor = [249, 115, 22];
          else if (text.includes('Check')) data.cell.styles.textColor = [245, 158, 11];
        }
      },
    });

    doc.save(`Drip4Life_VialStock_${branch?.name || selectedBranch}_${new Date().toISOString().split('T')[0]}.pdf`);
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
      { v: 'Vial Name', s: headerStyle }, { v: 'Batch Number', s: headerStyle }, { v: 'Expiry Date', s: headerStyle },
      { v: 'Quantity', s: headerStyle }, { v: 'Min Qty', s: headerStyle }, { v: 'Status', s: headerStyle },
      { v: 'Last Updated', s: headerStyle }, { v: 'Updated By', s: headerStyle },
    ]];

    vials.forEach(vial => {
      const item = branchStock[vial.id] || {};
      const expStatus = getExpiryStatus(item.expiryDate);
      const stkStatus = getStockStatus(Number(item.quantity) || 0, vial.minQty);
      const statusText = `${expStatus.label}${stkStatus.color !== 'green' ? ' / ' + stkStatus.label : ''}`;
      const statusColor = (expStatus.color === 'red' || stkStatus.color === 'red') ? 'EF4444' : (expStatus.color === 'orange' || stkStatus.color === 'amber') ? 'F97316' : '22C55E';

      rows.push([
        { v: vial.name, s: cellStyle }, { v: item.batchNumber || '', s: cellStyle }, { v: item.expiryDate || '', s: cellStyle },
        { v: Number(item.quantity) || 0, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
        { v: vial.minQty, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
        { v: statusText, s: { ...cellStyle, font: { color: { rgb: statusColor } } } },
        { v: item.lastUpdated || '', s: cellStyle }, { v: item.updatedBy || '', s: cellStyle },
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, branch?.name || selectedBranch);

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `Drip4Life_VialStock_${branch?.name || selectedBranch}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const selectedBranchData = BRANCHES.find(b => b.id === selectedBranch);

  const editingVial = editingRow ? vials.find(v => v.id === editingRow) : null;

  return (
    <>
    {/* Mobile Edit Modal — rendered via portal to escape main's transform */}
    {isMobile && editingVial && createPortal(
      <MobileEditModal
        vial={editingVial}
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
            <Package className="w-7 h-7 text-d4l-gold" />
            Vial Stock Report
          </h1>
          {!isMobile && <p className="text-sm text-d4l-muted mt-1">Track vial inventory, expiry dates, and stock levels per branch</p>}
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
            submitted
              ? 'bg-green-500/8 border-green-500/25'
              : 'bg-amber-500/8 border-amber-500/25'
          }`}>
            {submitted ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            ) : (
              <CircleAlert className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {submitted ? (
                <p className={`text-green-300 font-medium ${isMobile ? 'text-sm' : 'text-sm'}`}>
                  Today's report submitted
                  <span className="text-green-400/60 font-normal"> — by {todayReport.submittedBy} at {new Date(todayReport.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
              ) : (
                <p className={`text-amber-300 font-medium ${isMobile ? 'text-sm' : 'text-sm'}`}>
                  Daily stock report not yet submitted
                  <span className="text-amber-400/60 font-normal"> — {selectedBranchData?.name}</span>
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Package} label="Total Vials" value={stats.total} color="blue" subtitle={!isMobile ? `Tracked at ${selectedBranchData?.name}` : undefined} />
        <StatCard icon={AlertCircle} label="Expired" value={stats.expired} color="red" subtitle={stats.expired > 0 ? 'Needs attention' : 'All OK'} />
        <StatCard icon={Clock} label="Expiring Soon" value={stats.expiringSoon} color="orange" subtitle={stats.expiringSoon > 0 ? 'Replace soon' : 'None'} />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats.lowStock + stats.outOfStock} color="amber" subtitle={stats.outOfStock > 0 ? `${stats.outOfStock} out of stock` : 'OK'} />
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-d4l-surface border border-d4l-border rounded-xl p-4 mb-5">
          <h3 className="text-sm font-semibold text-d4l-text mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-d4l-gold" />
            Stock History — {selectedBranchData?.name}
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
                        <span>Full stock report submitted</span>
                      ) : (
                        <span>
                          Updated <span className="text-d4l-gold">{entry.vialName}</span>
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
            placeholder="Search vials..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className={`w-full pl-9 pr-3 bg-d4l-surface border border-d4l-border rounded-lg text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none transition-colors ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'}`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'expired', 'expiring', 'low'].map(f => (
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
              {f === 'all' ? 'All' : f === 'expired' ? 'Expired' : f === 'expiring' ? 'Expiring' : 'Low Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MOBILE: Card Layout ───────────────────────────────────── */}
      {isMobile ? (
        <div className="space-y-3 mb-6">
          {displayVials.length === 0 ? (
            <div className="text-center py-8 text-d4l-dim bg-d4l-surface border border-d4l-border rounded-xl">
              {searchFilter || statusFilter !== 'all' ? 'No vials match your filter' : 'No vials configured'}
            </div>
          ) : (
            displayVials.map(vial => (
              <MobileVialCard
                key={vial.id}
                vial={vial}
                isAdmin={isAdmin}
                onEdit={() => startEdit(vial.id)}
                onRemove={() => removeVial(vial.id)}
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
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Vial Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Batch #</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Exp Date</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Qty</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Min</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Last Updated</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-d4l-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayVials.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-d4l-dim">
                      {searchFilter || statusFilter !== 'all' ? 'No vials match your filter' : 'No vials configured'}
                    </td>
                  </tr>
                ) : (
                  displayVials.map(vial => {
                    const isEditing = editingRow === vial.id;
                    const borderColor = vial.expiryStatus.color === 'red' ? 'border-l-red-500'
                      : vial.expiryStatus.color === 'orange' ? 'border-l-orange-500'
                      : vial.stockStatus.color === 'red' ? 'border-l-red-500'
                      : vial.stockStatus.color === 'amber' ? 'border-l-amber-500'
                      : 'border-l-transparent';

                    return (
                      <tr key={vial.id} className={`border-b border-d4l-border/50 hover:bg-d4l-raised/30 transition-colors border-l-4 ${borderColor}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-d4l-text">{vial.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input type="text" value={editData.batchNumber} onChange={e => setEditData({ ...editData, batchNumber: e.target.value })}
                              className="w-full px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text focus:border-d4l-gold/40 focus:outline-none" placeholder="Batch #" />
                          ) : (
                            <span className="text-d4l-text2">{vial.batchNumber || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input type="date" value={editData.expiryDate} onChange={e => setEditData({ ...editData, expiryDate: e.target.value })}
                              className="w-full px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text focus:border-d4l-gold/40 focus:outline-none" />
                          ) : (
                            <div>
                              <span className="text-d4l-text2">{formatDate(vial.expiryDate)}</span>
                              {vial.expiryStatus.days !== undefined && vial.expiryStatus.color !== 'green' && (
                                <span className={`block text-[10px] ${vial.expiryStatus.color === 'red' ? 'text-red-400' : 'text-orange-400'}`}>
                                  {vial.expiryStatus.days < 0 ? `${Math.abs(vial.expiryStatus.days)}d overdue` : `${vial.expiryStatus.days}d left`}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <input type="number" min="0" value={editData.quantity} onChange={e => setEditData({ ...editData, quantity: e.target.value })}
                              className="w-20 px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text text-center focus:border-d4l-gold/40 focus:outline-none" />
                          ) : (
                            <span className={`font-medium ${(Number(vial.quantity) || 0) < vial.minQty ? 'text-amber-400' : 'text-d4l-text'}`}>
                              {vial.quantity ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isAdmin ? (
                            <input type="number" min="0" value={vial.minQty} onChange={e => updateMinQty(vial.id, e.target.value)}
                              className="w-16 px-2 py-1 bg-d4l-raised border border-d4l-border rounded text-sm text-d4l-text text-center focus:border-d4l-gold/40 focus:outline-none" />
                          ) : (
                            <span className="text-d4l-text2">{vial.minQty}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <StatusBadge label={vial.expiryStatus.label} color={vial.expiryStatus.color} />
                            {vial.stockStatus.color !== 'green' && (
                              <StatusBadge label={vial.stockStatus.label} color={vial.stockStatus.color} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-d4l-dim text-xs">{vial.lastUpdated ? formatDate(vial.lastUpdated) : '—'}</span>
                            {vial.updatedBy && <span className="block text-[10px] text-d4l-dim">{vial.updatedBy}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(vial.id)} className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" title="Save">
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={cancelEdit} className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" title="Cancel">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(vial.id)} className="p-1.5 rounded-lg text-d4l-dim hover:text-d4l-gold hover:bg-d4l-gold/10 transition-colors" title="Edit">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button onClick={() => removeVial(vial.id)} className="p-1.5 rounded-lg text-d4l-dim hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove vial">
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
            onClick={() => setShowAddVial(!showAddVial)}
            className={`flex items-center justify-center gap-2 bg-d4l-surface border border-d4l-border rounded-xl text-d4l-text2 hover:border-d4l-gold/30 transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2.5 text-sm'}`}
          >
            <Plus className="w-5 h-5" /> Add Vial Type
          </button>
        )}
        <button
          onClick={() => setConfirmSubmit(true)}
          className={`flex items-center justify-center gap-2 rounded-xl font-bold transition-all ${isMobile ? 'px-6 py-4 text-base' : 'px-6 py-2.5 text-sm font-semibold'}`}
          style={{ backgroundColor: selectedBranchData?.color || '#e8e800', color: '#080808' }}
        >
          <Save className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} /> Submit Stock Report
        </button>
      </div>

      {/* Add Vial Modal */}
      {showAddVial && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setShowAddVial(false)}>
          <div className={`bg-d4l-surface border border-d4l-border w-full ${isMobile ? 'rounded-t-2xl p-5 pb-8' : 'rounded-2xl p-6 max-w-sm'}`} onClick={e => e.stopPropagation()}>
            {isMobile && <div className="w-10 h-1 bg-d4l-hover rounded-full mx-auto mb-4" />}
            <h3 className={`font-bold text-d4l-text font-[Bebas_Neue] tracking-wide mb-4 ${isMobile ? 'text-xl' : 'text-lg'}`}>Add New Vial Type</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-d4l-muted mb-1.5">Vial Name</label>
                <input type="text" value={newVialName} onChange={e => setNewVialName(e.target.value)} placeholder="e.g. MAGNESIUM 10ml"
                  className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text placeholder:text-d4l-dim focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`} />
              </div>
              <div>
                <label className="block text-sm text-d4l-muted mb-1.5">Minimum Quantity</label>
                <input type="number" min="1" value={newVialMinQty} onChange={e => setNewVialMinQty(e.target.value)}
                  className={`w-full bg-d4l-raised border border-d4l-border rounded-xl text-d4l-text focus:border-d4l-gold/40 focus:outline-none ${isMobile ? 'px-4 py-4 text-base' : 'px-3 py-2 text-sm'}`} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddVial(false)} className={`flex-1 bg-d4l-hover text-d4l-text2 rounded-xl hover:bg-d4l-active transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm'}`}>
                  Cancel
                </button>
                <button onClick={addVial} className={`flex-1 bg-d4l-gold text-d4l-bg rounded-xl font-bold hover:brightness-110 transition-all ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm font-semibold'}`}>
                  Add Vial
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
            <h3 className={`font-bold text-d4l-text font-[Bebas_Neue] tracking-wide mb-2 ${isMobile ? 'text-xl' : 'text-lg'}`}>Submit Stock Report</h3>
            <p className={`text-d4l-muted mb-5 ${isMobile ? 'text-base' : 'text-sm'}`}>
              This will log a complete stock report for <span className="text-d4l-text font-medium">{selectedBranchData?.name}</span>. Continue?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSubmit(false)} className={`flex-1 bg-d4l-hover text-d4l-text2 rounded-xl hover:bg-d4l-active transition-colors ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm'}`}>
                Cancel
              </button>
              <button onClick={submitFullReport} className={`flex-1 bg-d4l-gold text-d4l-bg rounded-xl font-bold hover:brightness-110 transition-all ${isMobile ? 'px-4 py-4 text-base' : 'px-4 py-2 text-sm font-semibold'}`}>
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
