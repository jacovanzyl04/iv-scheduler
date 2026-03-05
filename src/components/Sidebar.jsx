import { useState, useEffect } from 'react';
import { Calendar, CalendarDays, Users, ClipboardList, Clock, LayoutDashboard, ChevronLeft, ChevronRight, Droplets, FileCheck, UserCog, LogOut, Eye, MoreHorizontal, Package, ShoppingCart, ArrowRightLeft } from 'lucide-react';

const adminNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Weekly Schedule', icon: Calendar },
  { id: 'calendar', label: 'Monthly Calendar', icon: CalendarDays },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'availability', label: 'Availability', icon: ClipboardList },
  { id: 'hours', label: 'Pay Cycle Hours', icon: Clock },
  { id: 'timesheets', label: 'Timesheets', icon: FileCheck },
  { id: 'vial-stock', label: 'Vial Stock', icon: Package },
  { id: 'consumables-stock', label: 'Stock Take', icon: ShoppingCart },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
  { id: 'accounts', label: 'Manage Accounts', icon: UserCog },
];

const staffNavItems = [
  { id: 'my-dashboard', label: 'My Schedule', icon: LayoutDashboard },
  { id: 'full-schedule', label: 'Full Schedule', icon: Eye },
  { id: 'my-availability', label: 'Availability', icon: ClipboardList },
  { id: 'my-timesheet', label: 'Timesheet', icon: FileCheck },
  { id: 'vial-stock', label: 'Vial Stock', icon: Package },
  { id: 'consumables-stock', label: 'Stock Take', icon: ShoppingCart },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
];

// Admin bottom tabs: show 4 main + More
const adminBottomTabs = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'availability', label: 'Avail.', icon: ClipboardList },
];

const adminMoreItems = [
  { id: 'calendar', label: 'Monthly Calendar', icon: CalendarDays },
  { id: 'hours', label: 'Pay Cycle Hours', icon: Clock },
  { id: 'timesheets', label: 'Timesheets', icon: FileCheck },
  { id: 'vial-stock', label: 'Vial Stock', icon: Package },
  { id: 'consumables-stock', label: 'Stock Take', icon: ShoppingCart },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
  { id: 'accounts', label: 'Manage Accounts', icon: UserCog },
];

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export { useIsMobile };

export default function Sidebar({ activePage, setActivePage, isOpen, setIsOpen, userRole, currentUser, onLogout }) {
  const isMobile = useIsMobile();
  const navItems = userRole === 'admin' ? adminNavItems : staffNavItems;
  const [mounted, setMounted] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Close more sheet when page changes
  useEffect(() => {
    setShowMore(false);
  }, [activePage]);

  // === MOBILE LAYOUT ===
  if (isMobile) {
    const bottomTabs = userRole === 'admin' ? adminBottomTabs : staffNavItems;
    const isMorePage = userRole === 'admin' && adminMoreItems.some(item => item.id === activePage);

    return (
      <>
        {/* Mobile top header */}
        <header className="mobile-top-header">
          <div className="flex items-center gap-2">
            <div className="sidebar-logo-ring" style={{ width: 30, height: 30, borderRadius: 8 }}>
              <Droplets className="w-4 h-4 text-d4l-gold" />
            </div>
            <h1 className="text-sm font-bold font-[Bebas_Neue] tracking-[0.12em] sidebar-brand-text">
              DRIP4LIFE
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {currentUser?.email && (
              <div className="sidebar-user-avatar" style={{ width: 28, height: 28, borderRadius: 7, fontSize: '0.7rem' }}>
                {currentUser.email.charAt(0).toUpperCase()}
              </div>
            )}
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-d4l-dim hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile bottom tab bar */}
        <nav className="mobile-bottom-bar">
          {bottomTabs.map(item => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`mobile-tab ${active ? 'active' : ''}`}
              >
                <span className="tab-dot" />
                <Icon className="w-5 h-5" />
                <span className="tab-label">{item.label}</span>
              </button>
            );
          })}
          {userRole === 'admin' && (
            <button
              onClick={() => setShowMore(!showMore)}
              className={`mobile-tab ${isMorePage || showMore ? 'active' : ''}`}
            >
              <span className="tab-dot" />
              <MoreHorizontal className="w-5 h-5" />
              <span className="tab-label">More</span>
            </button>
          )}
        </nav>

        {/* More sheet */}
        {showMore && (
          <>
            <div className="mobile-more-sheet-backdrop" onClick={() => setShowMore(false)} />
            <div className="mobile-more-sheet">
              <div className="w-10 h-1 bg-d4l-hover rounded-full mx-auto mb-3" />
              {adminMoreItems.map(item => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActivePage(item.id); setShowMore(false); }}
                    className={`mobile-more-item ${active ? 'active' : ''}`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  // === DESKTOP LAYOUT (unchanged) ===
  const activeIndex = navItems.findIndex(item => item.id === activePage);

  return (
    <aside
      className="sidebar-root fixed left-0 top-0 h-full z-50 flex flex-col"
      style={{ width: isOpen ? 256 : 68, transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      {/* Glass background */}
      <div className="absolute inset-0 sidebar-glass" />

      {/* Subtle gold accent glow at top */}
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none sidebar-top-glow" />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center h-16 shrink-0 px-3 gap-2">
          {/* Logo */}
          <div className="sidebar-logo-ring shrink-0">
            <Droplets className="w-5 h-5 text-d4l-gold" />
          </div>

          {/* Brand text — slides away when collapsed */}
          <div
            className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
            style={{
              opacity: isOpen ? 1 : 0,
              maxWidth: isOpen ? 200 : 0,
              transition: 'opacity 0.25s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <h1 className="text-base font-bold leading-tight font-[Bebas_Neue] tracking-[0.15em] sidebar-brand-text">
              DRIP4LIFE
            </h1>
            <p className="text-[10px] text-d4l-dim tracking-wide">Staff Scheduling</p>
          </div>

          {/* Toggle — always visible */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="sidebar-toggle-btn shrink-0"
          >
            <ChevronLeft
              className="w-3.5 h-3.5"
              style={{
                transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 mb-2" style={{ height: 1, background: 'linear-gradient(90deg, rgba(232,232,0,0.15) 0%, rgba(232,232,0,0.03) 100%)' }} />

        {/* Navigation */}
        <nav className="flex-1 px-2 py-1 overflow-y-auto sidebar-nav">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            const hovered = hoveredId === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`sidebar-nav-item ${active ? 'sidebar-nav-active' : ''}`}
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateX(0)' : 'translateX(-12px)',
                  transition: `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s, background 0.2s ease, box-shadow 0.2s ease`,
                  justifyContent: isOpen ? 'flex-start' : 'center',
                  padding: isOpen ? '0 12px' : '0',
                }}
                title={!isOpen ? item.label : undefined}
              >
                {/* Active indicator bar */}
                {active && (
                  <div className="sidebar-active-bar" />
                )}

                {/* Icon */}
                <div
                  className="sidebar-icon-wrap"
                  style={{
                    color: active ? '#e8e800' : hovered ? '#c8c0a8' : '#6a6050',
                    transform: hovered && !active ? 'scale(1.1)' : 'scale(1)',
                    transition: 'color 0.2s ease, transform 0.2s ease',
                  }}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </div>

                {/* Label */}
                <span
                  className="sidebar-nav-label"
                  style={{
                    opacity: isOpen ? 1 : 0,
                    width: isOpen ? 'auto' : 0,
                    marginLeft: isOpen ? 10 : 0,
                    color: active ? '#e8e800' : hovered ? '#f0ece0' : '#8a8070',
                    transition: 'opacity 0.2s ease, width 0.3s ease, margin 0.3s ease, color 0.2s ease',
                  }}
                >
                  {item.label}
                </span>

                {/* Hover glow */}
                {(active || hovered) && (
                  <div
                    className="sidebar-item-glow"
                    style={{ opacity: active ? 0.08 : 0.03 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 pb-3 pt-2 shrink-0">
          <div className="mx-1 mb-2" style={{ height: 1, background: 'linear-gradient(90deg, rgba(232,232,0,0.1) 0%, transparent 100%)' }} />

          {/* User info */}
          {isOpen && currentUser?.email && (
            <div className="px-3 py-2 mb-1">
              <div className="flex items-center gap-2.5">
                <div className="sidebar-user-avatar">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-d4l-text2 truncate font-medium">{currentUser.email.split('@')[0]}</p>
                  <p className="text-[10px] text-d4l-dim truncate">{currentUser.email}</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={onLogout}
            className="sidebar-logout-btn"
            style={{ justifyContent: isOpen ? 'flex-start' : 'center' }}
            title={!isOpen ? 'Sign Out' : undefined}
          >
            <LogOut className="w-4 h-4" />
            {isOpen && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
