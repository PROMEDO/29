import React from 'react';

interface VerifiedPartnerNameProps {
  name: string;
  verified?: boolean;
  badgeSize?: number;
  gap?: number;
  truncate?: boolean;
  className?: string;
}

/**
 * Renders the partner name with the green verification badge ALWAYS positioned
 * to the physical LEFT of the name (regardless of Arabic RTL or English LTR).
 */
export const VerifiedPartnerName: React.FC<VerifiedPartnerNameProps> = ({
  name,
  verified,
  badgeSize = 18,
  gap = 5,
  truncate = false,
  className,
}) => {
  if (!verified) {
    return <>{name}</>;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
        direction: 'ltr',
        unicodeBidi: 'isolate',
        maxWidth: '100%',
        verticalAlign: 'middle',
      }}
    >
      <img
        src="/assets/verified-badge.png"
        alt="شريك موثق"
        title="شريك موثق"
        decoding="async"
        style={{
          width: `${badgeSize}px`,
          height: `${badgeSize}px`,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'block',
        }}
      />
      <span
        dir="auto"
        style={
          truncate
            ? {
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }
            : { minWidth: 0 }
        }
      >
        {name}
      </span>
    </span>
  );
};
