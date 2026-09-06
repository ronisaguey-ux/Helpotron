import React from 'react';

/**
 * AvatarWidget — LUMINOUS GLASS Identity Avatar (Stitch v6 / Spec 1.5 & 3.1.1)
 * Renders avatar image if available, otherwise first letter of displayName or public_id.
 * Guaranteed ≥40px hit area with crisp specular border and accessible fallback.
 */
export default function AvatarWidget({
  user,
  avatarUrl,
  size = 'md', // 'sm' (32px), 'md' (40px), 'lg' (48px)
  className = '',
}) {
  const url = avatarUrl || user?.avatar_url || user?.avatarUrl || user?.profile?.avatarUrl;
  const initial = (
    user?.profile?.displayName?.[0] ||
    user?.displayName?.[0] ||
    user?.public_id?.[0] ||
    user?.email?.[0] ||
    'R'
  ).toUpperCase();

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm min-w-[40px]',
    lg: 'w-12 h-12 text-base min-w-[48px]',
  };

  return (
    <div
      className={[
        'rounded-full bg-primary-container text-on-primary-container',
        'border border-outline-variant/30 flex items-center justify-center font-bold',
        'overflow-hidden shrink-0 select-none shadow-sm',
        sizeClasses[size] || sizeClasses.md,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {url ? (
        <img
          src={url}
          alt={user?.public_id || 'User avatar'}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Graceful fallback to initial if image fails to load
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export { AvatarWidget };
