import { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen, Upload, Search, Download, Pencil, Trash2, Pin, PinOff,
  FileText, Image as ImageIcon, File, X, History, Eye, MoreVertical,
  Filter, RefreshCw, ChevronDown,
} from 'lucide-react';
import {
  uploadDocumentFile,
  formatFileSize,
  formatRelativeTime,
  formatFullTime,
  getCategoryLabel,
  getFileKind,
  getImageThumbnailUrl,
  DOCUMENT_CATEGORIES,
  ACCEPT_ATTR,
  genId,
} from '../utils/documentFiles';

/* =========================================================================
   Main component
   ========================================================================= */
export default function Documents({
  documents,
  setDocuments,
  documentAudits,
  setDocumentAudits,
  userRole,
  currentUser,
  staffName,
}) {
  const canManage = userRole === 'admin' || userRole === 'hr';
  const canViewAudits = canManage;

  const [activeTab, setActiveTab] = useState('library');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Normalize documents & audits into sorted arrays
  const docsArr = useMemo(() => {
    const obj = documents || {};
    const arr = Object.values(obj).filter(Boolean);
    arr.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.uploadedAt || 0) - (a.uploadedAt || 0);
    });
    return arr;
  }, [documents]);

  const auditsArr = useMemo(() => {
    const obj = documentAudits || {};
    const arr = Object.values(obj).filter(Boolean);
    arr.sort((a, b) => (b.at || 0) - (a.at || 0));
    return arr;
  }, [documentAudits]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docsArr.filter(d => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (d.title || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q)
      );
    });
  }, [docsArr, search, categoryFilter]);

  const pushAudit = (entry) => {
    const id = genId();
    const now = Date.now();
    const actor = {
      byUid: currentUser?.uid || null,
      byName: staffName || currentUser?.email?.split('@')[0] || 'Unknown',
      byEmail: currentUser?.email || null,
      byRole: userRole || null,
      at: now,
    };
    setDocumentAudits(prev => ({ ...(prev || {}), [id]: { id, ...actor, ...entry } }));
  };

  /* --------------------------------- CRUD --------------------------------- */
  const handleUpload = async ({ file, title, category, description }) => {
    const uploadRes = await uploadDocumentFile(file, category);
    const id = genId();
    const now = Date.now();
    const doc = {
      id,
      title: title || file.name,
      description: description || '',
      category: category || 'other',
      fileUrl: uploadRes.fileUrl,
      fileName: uploadRes.fileName,
      fileType: uploadRes.fileType,
      fileKind: uploadRes.fileKind,
      fileSize: uploadRes.fileSize,
      uploadedBy: currentUser?.uid || null,
      uploadedByName: staffName || currentUser?.email?.split('@')[0] || 'Unknown',
      uploadedAt: now,
      updatedAt: now,
      pinned: false,
    };
    setDocuments(prev => ({ ...(prev || {}), [id]: doc }));
    pushAudit({
      action: 'uploaded',
      docId: id,
      title: doc.title,
      category: doc.category,
      details: [
        `File: ${doc.fileName}`,
        `Category: ${getCategoryLabel(doc.category)}`,
        `Size: ${formatFileSize(doc.fileSize)}`,
      ],
    });
  };

  const handleEdit = (original, { title, category, description }) => {
    const changes = [];
    if (title !== original.title) changes.push({ field: 'Title', from: original.title, to: title });
    if (category !== original.category) changes.push({ field: 'Category', from: getCategoryLabel(original.category), to: getCategoryLabel(category) });
    if ((description || '') !== (original.description || '')) changes.push({ field: 'Description', from: original.description || '(empty)', to: description || '(empty)' });
    if (!changes.length) return;

    setDocuments(prev => ({
      ...(prev || {}),
      [original.id]: {
        ...original,
        title,
        category,
        description,
        updatedAt: Date.now(),
      },
    }));
    pushAudit({
      action: 'edited',
      docId: original.id,
      title,
      category,
      changes,
    });
  };

  const handleDelete = (doc) => {
    setDocuments(prev => {
      const next = { ...(prev || {}) };
      delete next[doc.id];
      return next;
    });
    pushAudit({
      action: 'deleted',
      docId: doc.id,
      title: doc.title,
      category: doc.category,
      details: [`File: ${doc.fileName}`, `Size: ${formatFileSize(doc.fileSize)}`],
    });
  };

  const handleTogglePin = (doc) => {
    const pinned = !doc.pinned;
    setDocuments(prev => ({
      ...(prev || {}),
      [doc.id]: { ...doc, pinned, updatedAt: Date.now() },
    }));
    pushAudit({
      action: pinned ? 'pinned' : 'unpinned',
      docId: doc.id,
      title: doc.title,
      category: doc.category,
    });
  };

  /* --------------------------------- UI ----------------------------------- */
  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 section-animate">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Documents
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">
            Printables, promotional material, menus & forms — shared with the team
          </p>
        </div>
        {canManage && activeTab === 'library' && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow text-sm self-start"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        )}
      </div>

      {/* ===== TABS ===== */}
      <div className="flex items-center gap-1 mb-5 border-b border-d4l-border section-animate">
        <TabButton
          active={activeTab === 'library'}
          onClick={() => setActiveTab('library')}
          icon={<FolderOpen className="w-4 h-4" />}
          label="Library"
          count={docsArr.length}
        />
        {canViewAudits && (
          <TabButton
            active={activeTab === 'audits'}
            onClick={() => setActiveTab('audits')}
            icon={<History className="w-4 h-4" />}
            label="Audits"
            count={auditsArr.length}
          />
        )}
      </div>

      {/* ===== LIBRARY TAB ===== */}
      {activeTab === 'library' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4 section-animate">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-d4l-dim" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, description or file name..."
                className="w-full pl-9 pr-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/60"
              />
            </div>
            <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
          </div>

          {filteredDocs.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="w-10 h-10" />}
              title={docsArr.length === 0 ? 'No documents yet' : 'No matches'}
              hint={
                docsArr.length === 0
                  ? (canManage ? 'Click "Upload Document" to add your first file.' : 'Nothing has been uploaded yet. Check back soon.')
                  : 'Try a different search or category.'
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 section-animate section-animate-delay-1">
              {filteredDocs.map(doc => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  canManage={canManage}
                  onPreview={() => setPreviewDoc(doc)}
                  onEdit={() => setEditDoc(doc)}
                  onDelete={() => setDeleteDoc(doc)}
                  onTogglePin={() => handleTogglePin(doc)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== AUDITS TAB ===== */}
      {activeTab === 'audits' && canViewAudits && (
        <AuditsPanel audits={auditsArr} />
      )}

      {/* ===== MODALS ===== */}
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSubmit={async (payload) => {
            await handleUpload(payload);
            setUploadOpen(false);
          }}
        />
      )}
      {editDoc && (
        <EditModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSubmit={(payload) => {
            handleEdit(editDoc, payload);
            setEditDoc(null);
          }}
        />
      )}
      {deleteDoc && (
        <DeleteConfirm
          doc={deleteDoc}
          onClose={() => setDeleteDoc(null)}
          onConfirm={() => {
            handleDelete(deleteDoc);
            setDeleteDoc(null);
          }}
        />
      )}
      {previewDoc && (
        <PreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

/* =========================================================================
   Sub-components
   ========================================================================= */

function TabButton({ active, onClick, icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-d4l-gold text-d4l-gold'
          : 'border-transparent text-d4l-muted hover:text-d4l-text'
      }`}
    >
      {icon}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-d4l-gold/20 text-d4l-gold' : 'bg-d4l-hover text-d4l-dim'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function CategoryFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterChip label="All" active={value === 'all'} onClick={() => onChange('all')} />
      {DOCUMENT_CATEGORIES.map(c => (
        <FilterChip key={c.id} label={c.label} active={value === c.id} onClick={() => onChange(c.id)} />
      ))}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
        active
          ? 'bg-d4l-gold text-black'
          : 'bg-d4l-surface border border-d4l-border text-d4l-muted hover:text-d4l-text hover:border-d4l-gold/40'
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ icon, title, hint }) {
  return (
    <div className="bg-d4l-surface border border-d4l-border rounded-xl py-16 px-6 text-center panel-glow">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-d4l-hover/40 text-d4l-muted mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-d4l-text mb-1">{title}</h3>
      <p className="text-sm text-d4l-muted">{hint}</p>
    </div>
  );
}

/* ------------------------------ Document card --------------------------- */
function DocumentCard({ doc, canManage, onPreview, onEdit, onDelete, onTogglePin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const kind = doc.fileKind || getFileKind(doc.fileType);
  const canPreview = kind === 'pdf' || kind === 'image';

  const imgThumbnailUrl = kind === 'image' ? getImageThumbnailUrl(doc.fileUrl, 600) : null;

  return (
    <div className="bg-d4l-surface border border-d4l-border rounded-xl overflow-hidden panel-glow flex flex-col group hover:border-d4l-gold/40 transition-colors">
      {/* Thumbnail / preview area */}
      <button
        onClick={onPreview}
        disabled={!canPreview}
        className={`relative h-40 w-full flex items-center justify-center bg-d4l-bg border-b border-d4l-border overflow-hidden ${canPreview ? 'cursor-pointer hover:bg-d4l-hover/30' : 'cursor-default'}`}
      >
        {kind === 'image' && imgThumbnailUrl && !thumbError ? (
          <img
            src={imgThumbnailUrl}
            alt={doc.title}
            loading="lazy"
            onError={() => setThumbError(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : kind === 'pdf' ? (
          <PdfThumbnail url={doc.fileUrl} fileKind={kind} />
        ) : (
          <FileIcon kind={kind} large />
        )}
        {doc.pinned && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-d4l-gold/20 text-d4l-gold text-[10px] font-semibold">
            <Pin className="w-3 h-3" /> Pinned
          </span>
        )}
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-d4l-surface/90 border border-d4l-border text-[10px] font-semibold text-d4l-muted uppercase tracking-wide">
          {getCategoryLabel(doc.category)}
        </span>
      </button>

      {/* Body */}
      <div className="p-3.5 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-d4l-text mb-1 line-clamp-2" title={doc.title}>
          {doc.title}
        </h3>
        {doc.description && (
          <p className="text-xs text-d4l-muted mb-2 line-clamp-2">{doc.description}</p>
        )}
        <div className="flex items-center gap-2 text-[11px] text-d4l-dim mt-auto pt-2">
          <FileIcon kind={kind} />
          <span className="truncate flex-1">{doc.fileName}</span>
          <span className="shrink-0">{formatFileSize(doc.fileSize)}</span>
        </div>
        <p className="text-[10px] text-d4l-dim mt-1.5">
          Uploaded by <span className="text-d4l-muted">{doc.uploadedByName || 'Unknown'}</span>
          {' · '}
          <span title={formatFullTime(doc.uploadedAt)}>{formatRelativeTime(doc.uploadedAt)}</span>
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center border-t border-d4l-border">
        <a
          href={doc.fileUrl}
          download={doc.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-d4l-gold hover:bg-d4l-gold/10 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
        {canPreview && (
          <button
            onClick={onPreview}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-l border-d4l-border text-xs font-medium text-d4l-muted hover:text-d4l-text hover:bg-d4l-hover/40 transition-colors"
            title="Preview"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        {canManage && (
          <div className="relative border-l border-d4l-border">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center justify-center px-3 py-2.5 text-d4l-muted hover:text-d4l-text hover:bg-d4l-hover/40 transition-colors"
              title="More"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 bottom-full mb-1 bg-d4l-raised border border-d4l-border rounded-lg shadow-2xl z-30 min-w-[150px] overflow-hidden">
                  <MenuItem icon={doc.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            label={doc.pinned ? 'Unpin' : 'Pin to top'}
                            onClick={() => { setMenuOpen(false); onTogglePin(); }} />
                  <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit details"
                            onClick={() => { setMenuOpen(false); onEdit(); }} />
                  <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" danger
                            onClick={() => { setMenuOpen(false); onDelete(); }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-d4l-text hover:bg-d4l-hover'
      }`}
    >
      {icon}{label}
    </button>
  );
}

function FileIcon({ kind, large }) {
  const cls = large ? 'w-12 h-12' : 'w-3.5 h-3.5';
  if (kind === 'pdf')   return <FileText  className={`${cls} text-red-400`} />;
  if (kind === 'image') return <ImageIcon className={`${cls} text-blue-400`} />;
  if (kind === 'word')  return <FileText  className={`${cls} text-sky-400`} />;
  return <File className={`${cls} text-d4l-muted`} />;
}

/* --------------------------------- Modals ------------------------------- */

// Lock body scroll while any modal is open
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

function ModalShell({ title, onClose, children, widthClass = 'max-w-md' }) {
  useLockBodyScroll();
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className={`bg-d4l-raised border border-d4l-border rounded-xl shadow-2xl w-full ${widthClass} pointer-events-auto max-h-[90vh] flex flex-col`}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-d4l-border shrink-0">
            <h2 className="text-base font-semibold text-d4l-text truncate pr-4">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-d4l-muted hover:text-d4l-text hover:bg-d4l-hover transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </div>
      </div>
    </>
  );
}

function UploadModal({ onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('printables');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Select a file first.'); return; }
    setUploading(true);
    setError(null);
    try {
      await onSubmit({ file, title: title.trim() || file.name, category, description: description.trim() });
    } catch (err) {
      setError(err.message || 'Upload failed.');
      setUploading(false);
    }
  };

  return (
    <ModalShell title="Upload Document" onClose={uploading ? () => {} : onClose} widthClass="max-w-lg">
      <form onSubmit={submit} className="p-5 space-y-4">
        {/* File picker */}
        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">File *</label>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-full px-4 py-3 rounded-lg border-2 border-dashed transition-colors flex items-center gap-3 ${
              file ? 'border-d4l-gold/40 bg-d4l-gold/5' : 'border-d4l-border hover:border-d4l-gold/40 bg-d4l-surface'
            }`}
          >
            <Upload className="w-4 h-4 text-d4l-gold shrink-0" />
            <div className="flex-1 text-left min-w-0">
              {file ? (
                <>
                  <p className="text-sm text-d4l-text truncate">{file.name}</p>
                  <p className="text-[11px] text-d4l-dim">{formatFileSize(file.size)} — click to change</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-d4l-text">Click to select a file</p>
                  <p className="text-[11px] text-d4l-dim">PDF, image or Word · max 25 MB</p>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. A4 Drip Menu — November 2026"
            className="w-full px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/60"
            required
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Category</label>
          <div className="grid grid-cols-3 gap-2">
            {DOCUMENT_CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-2 py-2 text-xs rounded-lg transition-colors ${
                  category === c.id
                    ? 'bg-d4l-gold text-black font-semibold'
                    : 'bg-d4l-surface border border-d4l-border text-d4l-muted hover:text-d4l-text'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Add a short note about what this file is for..."
            className="w-full px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/60 resize-none"
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 px-4 py-2 text-sm bg-d4l-surface border border-d4l-border rounded-lg text-d4l-muted hover:text-d4l-text transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading || !file}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark disabled:opacity-50 btn-glow"
          >
            {uploading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload</>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditModal({ doc, onClose, onSubmit }) {
  const [title, setTitle] = useState(doc.title || '');
  const [category, setCategory] = useState(doc.category || 'other');
  const [description, setDescription] = useState(doc.description || '');

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ title: title.trim() || doc.title, category, description: description.trim() });
  };

  return (
    <ModalShell title="Edit Document" onClose={onClose} widthClass="max-w-lg">
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/60"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Category</label>
          <div className="grid grid-cols-3 gap-2">
            {DOCUMENT_CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-2 py-2 text-xs rounded-lg transition-colors ${
                  category === c.id
                    ? 'bg-d4l-gold text-black font-semibold'
                    : 'bg-d4l-surface border border-d4l-border text-d4l-muted hover:text-d4l-text'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-d4l-muted mb-1.5 uppercase tracking-wide">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-d4l-surface border border-d4l-border rounded-lg text-sm text-d4l-text focus:outline-none focus:border-d4l-gold/60 resize-none"
          />
        </div>

        <p className="text-[11px] text-d4l-dim">
          The underlying file cannot be replaced — to change the file, delete this entry and upload a new one.
        </p>

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-d4l-surface border border-d4l-border rounded-lg text-d4l-muted hover:text-d4l-text transition-colors">Cancel</button>
          <button type="submit" className="flex-1 px-4 py-2 text-sm bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow">Save changes</button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteConfirm({ doc, onClose, onConfirm }) {
  return (
    <ModalShell title="Delete Document" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-d4l-text">
          Delete <span className="font-semibold">{doc.title}</span>?
        </p>
        <p className="text-xs text-d4l-muted">
          This removes it from the library for everyone. The action is logged in Audits and cannot be undone.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-d4l-surface border border-d4l-border rounded-lg text-d4l-muted hover:text-d4l-text transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-red-500/90 text-white font-semibold rounded-lg hover:bg-red-500">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function PreviewModal({ doc, onClose }) {
  useLockBodyScroll();
  const kind = doc.fileKind || getFileKind(doc.fileType);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-2 md:inset-4 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-d4l-raised border border-d4l-border rounded-xl shadow-2xl w-full h-full max-w-[1600px] pointer-events-auto flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 md:px-5 border-b border-d4l-border shrink-0 bg-d4l-surface" style={{ minHeight: 52 }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileIcon kind={kind} />
              <h2 className="text-sm md:text-base font-semibold text-d4l-text truncate">{doc.title || 'Preview'}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-d4l-muted hover:text-d4l-text hover:bg-d4l-hover transition-colors shrink-0"
              title="Close (Esc)"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content — fills all remaining vertical space */}
          <div className="flex-1 min-h-0 bg-d4l-bg overflow-hidden">
            {kind === 'pdf' && (
              <iframe
                src={doc.fileUrl}
                title={doc.title}
                className="w-full h-full block"
                style={{ border: 0 }}
              />
            )}
            {kind === 'image' && (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                <img
                  src={doc.fileUrl}
                  alt={doc.title}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            {kind !== 'pdf' && kind !== 'image' && (
              <div className="h-full flex items-center justify-center p-8 text-center text-sm text-d4l-muted">
                <div>
                  Inline preview is not available for this file type.
                  {' '}
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-d4l-gold underline">
                    Open in a new tab
                  </a>
                  {' '}or download below.
                </div>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between gap-3 px-4 md:px-5 border-t border-d4l-border text-xs text-d4l-muted shrink-0 bg-d4l-surface" style={{ minHeight: 48 }}>
            <span className="truncate">
              {doc.fileName} · {formatFileSize(doc.fileSize)}
            </span>
            <a
              href={doc.fileUrl}
              download={doc.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-d4l-gold text-black font-semibold rounded-md text-xs btn-glow shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Audits panel ---------------------------- */

const ACTION_STYLES = {
  uploaded: { label: 'Uploaded', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  edited:   { label: 'Edited',   color: 'text-d4l-gold', bg: 'bg-d4l-gold/10',  border: 'border-d4l-gold/30' },
  deleted:  { label: 'Deleted',  color: 'text-red-400',  bg: 'bg-red-500/10',   border: 'border-red-500/30' },
  pinned:   { label: 'Pinned',   color: 'text-blue-300', bg: 'bg-blue-500/10',  border: 'border-blue-500/30' },
  unpinned: { label: 'Unpinned', color: 'text-d4l-muted',bg: 'bg-d4l-hover/40', border: 'border-d4l-border' },
};

function AuditsPanel({ audits }) {
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audits.filter(a => {
      if (actionFilter !== 'all' && a.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (a.title || '').toLowerCase().includes(q) ||
        (a.byName || '').toLowerCase().includes(q) ||
        (a.byEmail || '').toLowerCase().includes(q)
      );
    });
  }, [audits, search, actionFilter]);

  return (
    <>
      {/* Controls row */}
      <div className="bg-d4l-surface border border-d4l-border rounded-xl p-3 mb-4 flex flex-col md:flex-row md:items-center gap-3 section-animate panel-glow">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-d4l-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audits..."
            className="w-full pl-9 pr-3 py-2 bg-d4l-bg border border-d4l-border rounded-lg text-sm text-d4l-text placeholder-d4l-dim focus:outline-none focus:border-d4l-gold/60"
          />
        </div>
        <ActionFilter value={actionFilter} onChange={setActionFilter} />
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between text-xs text-d4l-muted mb-3">
        <span>
          Showing <span className="text-d4l-text font-semibold">{filtered.length}</span> of {audits.length} results — sorted by <span className="text-d4l-gold">Created, Descending</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<History className="w-10 h-10" />}
          title={audits.length === 0 ? 'No audit events yet' : 'No matches'}
          hint={audits.length === 0 ? 'Activity on documents will appear here.' : 'Try a different search or filter.'}
        />
      ) : (
        <div className="space-y-2 section-animate section-animate-delay-1">
          {filtered.map(a => <AuditRow key={a.id} audit={a} />)}
        </div>
      )}
    </>
  );
}

function ActionFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const options = [
    { id: 'all',      label: 'All actions' },
    { id: 'uploaded', label: 'Uploaded' },
    { id: 'edited',   label: 'Edited' },
    { id: 'deleted',  label: 'Deleted' },
    { id: 'pinned',   label: 'Pinned' },
    { id: 'unpinned', label: 'Unpinned' },
  ];
  const current = options.find(o => o.id === value) || options[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 bg-d4l-bg border border-d4l-border rounded-lg text-sm text-d4l-text hover:border-d4l-gold/40 transition-colors min-w-[160px] justify-between"
      >
        <span className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-d4l-muted" />{current.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-d4l-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-d4l-raised border border-d4l-border rounded-lg shadow-2xl z-30 min-w-[160px] overflow-hidden">
            {options.map(o => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  value === o.id
                    ? 'bg-d4l-gold/10 text-d4l-gold'
                    : 'text-d4l-text hover:bg-d4l-hover'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({ audit }) {
  const style = ACTION_STYLES[audit.action] || ACTION_STYLES.edited;
  const initials = (audit.byName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-d4l-surface border border-d4l-border rounded-lg overflow-hidden">
      {/* Banner */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-d4l-bg border-b border-d4l-border">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-d4l-text uppercase tracking-wide">Document</p>
          <p className="text-sm text-d4l-muted truncate">
            {audit.title} <span className="text-d4l-dim">({getCategoryLabel(audit.category)})</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full bg-d4l-gold/20 text-d4l-gold flex items-center justify-center text-[11px] font-semibold">
            {initials}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[11px] text-d4l-text font-medium truncate max-w-[140px]">{audit.byName}</p>
            <p className="text-[10px] text-d4l-dim">{audit.byRole || 'user'}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.color} ${style.bg} ${style.border}`}>
            {style.label}
          </span>
          <p className="text-xs text-d4l-muted">
            {style.label} Document: <span className="text-d4l-text font-medium">{audit.title}</span>
          </p>
        </div>

        {Array.isArray(audit.changes) && audit.changes.length > 0 && (
          <ul className="pl-4 space-y-0.5">
            {audit.changes.map((c, i) => (
              <li key={i} className="text-xs text-d4l-muted list-disc list-outside marker:text-d4l-dim">
                <span className="text-d4l-text2">{c.field}:</span>{' '}
                <span className="text-d4l-dim line-through">{truncate(c.from)}</span>
                {' → '}
                <span className="text-d4l-text">{truncate(c.to)}</span>
              </li>
            ))}
          </ul>
        )}

        {Array.isArray(audit.details) && audit.details.length > 0 && (
          <ul className="pl-4 space-y-0.5">
            {audit.details.map((d, i) => (
              <li key={i} className="text-xs text-d4l-muted list-disc list-outside marker:text-d4l-dim">{d}</li>
            ))}
          </ul>
        )}

        <p className="text-[10px] text-d4l-dim mt-2" title={formatFullTime(audit.at)}>
          {formatFullTime(audit.at)} · {formatRelativeTime(audit.at)}
        </p>
      </div>
    </div>
  );
}

function truncate(s, max = 60) {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* --------------------------- PDF thumbnail renderer --------------------- */
// Render page 1 of a PDF to a canvas using pdf.js (client-side).
// Works for any PDF URL that is publicly accessible with CORS (Cloudinary
// serves files with Access-Control-Allow-Origin: * by default).
// Results are cached in-memory by URL so scrolling / filtering is free.

let pdfjsLibPromise = null;
const pdfThumbnailCache = new Map(); // url -> dataUrl

async function loadPdfjs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = (async () => {
    const [pdfjs, workerMod] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
    return pdfjs;
  })();
  return pdfjsLibPromise;
}

function PdfThumbnail({ url }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!url) { setStatus('error'); return; }

    let cancelled = false;

    const paintFromDataUrl = (dataUrl) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        setStatus('ready');
      };
      img.onerror = () => { if (!cancelled) setStatus('error'); };
      img.src = dataUrl;
    };

    const cached = pdfThumbnailCache.get(url);
    if (cached) {
      paintFromDataUrl(cached);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({ url, isEvalSupported: false });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 600;
        const scale = Math.min(targetWidth / baseViewport.width, 2); // cap at 2x
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');

        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;

        try {
          pdfThumbnailCache.set(url, canvas.toDataURL('image/jpeg', 0.75));
        } catch { /* tainted canvas — ignore cache */ }

        setStatus('ready');
      } catch (err) {
        console.warn('[PdfThumbnail] render failed for', url, err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  if (status === 'error') return <FileIcon kind="pdf" large />;

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-d4l-dim animate-spin" />
        </div>
      )}
    </>
  );
}
