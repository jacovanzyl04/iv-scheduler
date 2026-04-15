/**
 * Shared tab-bar component used on pages that have both a main view and an
 * embedded Logs view. Matches the D4L look: underline indicator, gold active
 * state, count chip.
 *
 * <PageTabs
 *   tabs={[{ id: 'main', label: 'Staff', icon: <Users/> },
 *          { id: 'logs', label: 'Logs', icon: <History/>, count: 42 }]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 */
export default function PageTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-d4l-border section-animate overflow-x-auto overflow-y-hidden">
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              active
                ? 'border-d4l-gold text-d4l-gold'
                : 'border-transparent text-d4l-muted hover:text-d4l-text'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-d4l-gold/20 text-d4l-gold' : 'bg-d4l-hover text-d4l-dim'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
