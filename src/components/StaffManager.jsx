import { useState } from 'react';
import { BRANCHES } from '../data/initialData';
import { UserPlus, Edit2, Trash2, X, Check, Star, MapPin, Clock, AlertCircle } from 'lucide-react';

const STAFF_COLORS = [
  { id: null, label: 'None', hex: null },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
];

const EMPTY_STAFF = {
  name: '',
  role: 'nurse',
  employmentType: 'parttime',
  canWorkAlone: false,
  branches: [],
  lastResortBranches: [],
  mainBranch: null,
  availableDays: null,
  priority: false,
  monthlyHoursTarget: null,
  minShiftsPerWeek: null,
  weekendBothOrNone: false,
  color: null,
  notes: '',
};

export default function StaffManager({ staff, setStaff }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');

  const startEdit = (member) => {
    setEditingId(member.id);
    setFormData({ ...member });
    setShowForm(true);
  };

  const startAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_STAFF, id: `staff_${Date.now()}` });
    setShowForm(true);
  };

  const saveStaff = () => {
    if (!formData.name.trim()) return;

    if (editingId) {
      setStaff(prev => prev.map(s => s.id === editingId ? formData : s));
    } else {
      setStaff(prev => [...prev, formData]);
    }
    setShowForm(false);
    setFormData(null);
    setEditingId(null);
  };

  const deleteStaff = (id) => {
    if (window.confirm('Remove this staff member?')) {
      setStaff(prev => prev.filter(s => s.id !== id));
    }
  };

  const filteredStaff = staff.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'nurses') return s.role === 'nurse';
    if (filter === 'receptionists') return s.role === 'receptionist';
    if (filter === 'permanent') return s.employmentType === 'permanent';
    return true;
  });

  const roleColor = (role) => {
    if (role === 'nurse') return 'nurse-badge';
    return 'receptionist-badge';
  };

  const typeColor = (type) => {
    if (type === 'permanent') return 'bg-green-100 text-green-700 border border-green-300';
    if (type === 'locum') return 'bg-orange-100 text-orange-700 border border-orange-300';
    return 'bg-gray-100 text-gray-700 border border-gray-300';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Staff Management</h1>
          <p className="text-gray-500 text-sm">{staff.length} staff members</p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['all', 'nurses', 'receptionists', 'permanent'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Staff cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map(member => (
          <div key={member.id} className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-gray-800 flex items-center gap-1.5">
                  {member.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0 inline-block"
                      style={{ backgroundColor: STAFF_COLORS.find(c => c.id === member.color)?.hex }}
                    />
                  )}
                  {member.name}
                  {member.priority && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                  {member.alsoManager && <span className="text-xs text-amber-600 font-normal">(Manager)</span>}
                </h3>
                <div className="flex gap-1.5 mt-1">
                  <span className={`staff-badge ${roleColor(member.role)}`}>{member.role}</span>
                  <span className={`staff-badge ${typeColor(member.employmentType)}`}>{member.employmentType}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(member)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteStaff(member.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-sm">
              {/* Branches */}
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div className="text-gray-600">
                  {member.branches.map(bId => {
                    const b = BRANCHES.find(br => br.id === bId);
                    const isMain = member.mainBranch === bId;
                    return (
                      <span key={bId} className={`inline-block mr-1 ${isMain ? 'font-medium text-gray-800' : ''}`}>
                        {b?.name || bId}{isMain ? ' ★' : ''}
                        {member.branches.indexOf(bId) < member.branches.length - 1 ? ',' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Available days */}
              {member.availableDays && (
                <div className="flex items-start gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-gray-600">{member.availableDays.join(', ')} only</span>
                </div>
              )}

              {/* Constraints */}
              {member.canWorkAlone && (
                <div className="flex items-center gap-1.5 text-blue-600">
                  <Check className="w-3.5 h-3.5" />
                  <span>Can work alone</span>
                </div>
              )}

              {member.minShiftsPerWeek && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Min {member.minShiftsPerWeek} shifts/week</span>
                </div>
              )}

              {member.weekendBothOrNone && (
                <div className="flex items-center gap-1.5 text-purple-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Both weekend days or none</span>
                </div>
              )}

              {member.monthlyHoursTarget !== null && member.monthlyHoursTarget > 0 && (
                <div className="flex items-center gap-1.5 text-green-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Target: {member.monthlyHoursTarget}h/month</span>
                </div>
              )}

              {member.notes && (
                <p className="text-xs text-gray-400 mt-1 italic">{member.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Add Modal */}
      {showForm && formData && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-[500px] max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingId ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  placeholder="Staff member name"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="nurse">Nurse</option>
                  <option value="receptionist">Receptionist</option>
                </select>
              </div>

              {/* Employment type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                <select
                  value={formData.employmentType}
                  onChange={e => setFormData({ ...formData, employmentType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="permanent">Permanent</option>
                  <option value="parttime">Part-time</option>
                  <option value="locum">Locum</option>
                </select>
              </div>

              {/* Can work alone */}
              {formData.role === 'nurse' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.canWorkAlone}
                    onChange={e => setFormData({ ...formData, canWorkAlone: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Can work alone (no receptionist needed)</span>
                </label>
              )}

              {/* Priority */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.priority}
                  onChange={e => setFormData({ ...formData, priority: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded"
                />
                <span className="text-sm text-gray-700">Priority scheduling (gets all requested shifts)</span>
              </label>

              {/* Branches */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Available Branches</label>
                <div className="space-y-1">
                  {BRANCHES.map(branch => (
                    <label key={branch.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.branches?.includes(branch.id)}
                        onChange={e => {
                          const branches = e.target.checked
                            ? [...(formData.branches || []), branch.id]
                            : (formData.branches || []).filter(b => b !== branch.id);
                          setFormData({ ...formData, branches });
                        }}
                        className="w-4 h-4 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700">{branch.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Main branch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Main Branch (preferred)</label>
                <select
                  value={formData.mainBranch || ''}
                  onChange={e => setFormData({ ...formData, mainBranch: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="">No preference</option>
                  {BRANCHES.filter(b => formData.branches?.includes(b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Available days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Available Days</label>
                <div className="flex flex-wrap gap-1">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const isSelected = !formData.availableDays || formData.availableDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (!formData.availableDays) {
                            // Currently all days, switch to specific selection
                            setFormData({ ...formData, availableDays: [day] });
                          } else if (formData.availableDays.includes(day)) {
                            const newDays = formData.availableDays.filter(d => d !== day);
                            setFormData({ ...formData, availableDays: newDays.length === 7 ? null : newDays.length === 0 ? null : newDays });
                          } else {
                            const newDays = [...formData.availableDays, day];
                            setFormData({ ...formData, availableDays: newDays.length === 7 ? null : newDays });
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          isSelected ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {!formData.availableDays ? 'All days (click to restrict)' : `${formData.availableDays.length} days selected`}
                </p>
              </div>

              {/* Weekend both or none */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.weekendBothOrNone || false}
                  onChange={e => setFormData({ ...formData, weekendBothOrNone: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded"
                />
                <span className="text-sm text-gray-700">Must work both weekend days or none</span>
              </label>

              {/* Min shifts per week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Shifts Per Week</label>
                <input
                  type="number"
                  value={formData.minShiftsPerWeek || ''}
                  onChange={e => setFormData({ ...formData, minShiftsPerWeek: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="Leave empty if no minimum"
                  min="0"
                  max="7"
                />
              </div>

              {/* Monthly hours target */}
              {formData.employmentType === 'permanent' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Hours Target</label>
                  <input
                    type="number"
                    value={formData.monthlyHoursTarget || ''}
                    onChange={e => setFormData({ ...formData, monthlyHoursTarget: e.target.value ? parseInt(e.target.value) : 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="Required monthly hours"
                    min="0"
                  />
                </div>
              )}

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color Tag</label>
                <div className="flex gap-2 flex-wrap">
                  {STAFF_COLORS.map(c => (
                    <button
                      key={c.id || 'none'}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.id })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        formData.color === c.id ? 'border-gray-800 scale-110' : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: c.hex || '#f3f4f6' }}
                      title={c.label}
                    >
                      {!c.hex && <span className="text-xs text-gray-400 leading-none">-</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  rows="2"
                  placeholder="Any special notes or constraints..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveStaff}
                  disabled={!formData.name.trim()}
                  className="flex-1 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {editingId ? 'Save Changes' : 'Add Staff Member'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
