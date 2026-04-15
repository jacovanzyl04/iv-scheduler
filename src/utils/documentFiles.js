const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DOCUMENT_CATEGORIES = [
  { id: 'printables',  label: 'Printables' },
  { id: 'promotional', label: 'Promotional' },
  { id: 'menus',       label: 'Menus' },
  { id: 'forms',       label: 'Forms' },
  { id: 'training',    label: 'Training' },
  { id: 'other',       label: 'Other' },
];

export function getCategoryLabel(id) {
  return DOCUMENT_CATEGORIES.find(c => c.id === id)?.label || 'Other';
}

export function getFileKind(fileType) {
  if (!fileType) return 'other';
  if (fileType === 'application/pdf') return 'pdf';
  if (fileType.startsWith('image/')) return 'image';
  if (fileType.includes('word') || fileType.includes('document')) return 'word';
  return 'other';
}

function safeName(name) {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9\-_]/gi, '_').slice(0, 50) || 'file';
}

/**
 * Upload a document file to Cloudinary.
 * Accepts PDF, images (JPG/PNG/WEBP/HEIC), and Word (.doc, .docx).
 * Returns { fileUrl, fileName, fileType, fileKind, fileSize }.
 */
export async function uploadDocumentFile(file, category = 'other') {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env');
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please upload a PDF, image (JPG/PNG/WEBP/HEIC), or Word document (.doc, .docx).');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  const kind = getFileKind(file.type);
  // Use 'image' resource for actual images, 'raw' for PDFs and Word docs
  const resourceType = kind === 'image' ? 'image' : 'raw';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('public_id', `documents/${category}/${Date.now()}_${safeName(file.name)}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed. Please try again.');
  }

  const data = await res.json();
  return {
    fileUrl: data.secure_url,
    fileName: file.name,
    fileType: file.type,
    fileKind: kind,
    fileSize: file.size,
  };
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatFullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yr}-${mo}-${da} ${hh}:${mm}:${ss}`;
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
