import React from 'react';

export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}