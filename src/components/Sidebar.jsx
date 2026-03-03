import { Calendar, CalendarDays, Users, ClipboardList, Clock, LayoutDashboard, ChevronLeft, ChevronRight, Droplets, FileCheck, UserCog, LogOut, Eye } from 'lucide-react';

const adminNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Weekly Schedule', icon: Calendar },
  { id: 'calendar', label: 'Monthly Calendar', icon: CalendarDays },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'availability', label: 'Availability', icon: ClipboardList },
  { id: 'hours', label: 'Pay Cycle Hours', icon: Clock },
  { id: 'timesheets', label: 'Timesheets', icon: FileCheck },
  { id: 'accounts', label: 'Manage Accounts', icon: UserCog },
];

const staffNavItems = [
  { id: 'my-dashboard', label: 'My Schedule', icon: LayoutDashboard },
  { id: 'full-schedule', label: 'Full Schedule', icon: Eye },
  { id: 'my-availability', label: 'My Availability', icon: ClipboardList },
  { id: 'my-timesheet', label: 'My Timesheet', icon: FileCheck },
];

export default function Sidebar({ activePage, setActivePage, isOpen, setIsOpen, userRole, currentUser, onLogout }) {
  const navItems = userRole === 'admin' ? adminNavItems : staffNavItems;

  return (
    <aside className={`fixed left-0 top-0 h-full bg-gradient-to-b from-teal-700 to-teal-900 text-white transition-all duration-300 z-50 flex flex-col ${isOpen ? 'w-64' : 'w-16'}`}>
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
      <nav className="mt-4 px-2 flex-1">
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

      {/* Footer — user info + logout */}
      <div className="p-3 border-t border-teal-600">
        {isOpen ? (
          <div>
            <p className="text-xs text-teal-300 truncate px-1 mb-2">{currentUser?.email}</p>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-teal-200 rounded-lg hover:bg-teal-600/50 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center p-2 text-teal-200 rounded-lg hover:bg-teal-600/50 hover:text-white transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </aside>
  );
}
