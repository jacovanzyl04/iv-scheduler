import { Calendar, Users, ClipboardList, Clock, LayoutDashboard, ChevronLeft, ChevronRight, Droplets } from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Weekly Schedule', icon: Calendar },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'availability', label: 'Availability', icon: ClipboardList },
  { id: 'hours', label: 'Monthly Hours', icon: Clock },
];

export default function Sidebar({ activePage, setActivePage, isOpen, setIsOpen }) {
  return (
    <aside className={`fixed left-0 top-0 h-full bg-gradient-to-b from-teal-700 to-teal-900 text-white transition-all duration-300 z-50 ${isOpen ? 'w-64' : 'w-16'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-teal-600">
        {isOpen && (
          <div className="flex items-center gap-2">
            <Droplets className="w-6 h-6 text-teal-300" />
            <div>
              <h1 className="text-lg font-bold leading-tight">IV Scheduler</h1>
              <p className="text-xs text-teal-300">Staff Management</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded hover:bg-teal-600 transition-colors"
        >
          {isOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-4 px-2">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-all text-left
                ${active
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-teal-200 hover:bg-teal-600/50 hover:text-white'
                }`}
              title={!isOpen ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {isOpen && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      {isOpen && (
        <div className="absolute bottom-4 left-4 right-4 text-xs text-teal-400">
          <p>Drip4Life IV Therapy</p>
        </div>
      )}
    </aside>
  );
}
