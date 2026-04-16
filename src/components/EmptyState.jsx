export default function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="bg-d4l-surface border border-d4l-border rounded-xl py-16 px-6 text-center panel-glow card-animate">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-d4l-hover/40 text-d4l-muted mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-d4l-text mb-1">{title}</h3>
      <p className="text-sm text-d4l-muted max-w-xs mx-auto">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
