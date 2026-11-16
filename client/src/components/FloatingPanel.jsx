import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 8;
const EDGE = 12;
const HIDDEN = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

// Renders a popup in document.body, anchored to `anchor`, so cards with overflow,
// scrolling modal bodies and stacking contexts can no longer clip or cover it.
export default function FloatingPanel({
  anchor,
  open,
  onClose,
  align = 'start',
  matchWidth = false,
  className = '',
  children,
  ...props
}) {
  const panel = useRef(null);
  const [style, setStyle] = useState(HIDDEN);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const node = panel.current;
      const rect = anchor.current?.getBoundingClientRect();
      if (!node || !rect) return;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - GAP - EDGE;
      const spaceAbove = rect.top - GAP - EDGE;
      const placeAbove = node.scrollHeight > spaceBelow && spaceAbove > spaceBelow;
      const width = Math.max(node.offsetWidth, matchWidth ? rect.width : 0);
      const preferredLeft = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(EDGE, Math.min(preferredLeft, viewportWidth - width - EDGE));
      setStyle({
        position: 'fixed',
        left,
        right: 'auto',
        top: placeAbove ? 'auto' : rect.bottom + GAP,
        bottom: placeAbove ? viewportHeight - rect.top + GAP : 'auto',
        transformOrigin: placeAbove ? 'bottom' : 'top',
        '--anchor-width': `${rect.width}px`,
        '--floating-max-height': `${Math.max(140, placeAbove ? spaceAbove : spaceBelow)}px`,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      setStyle(HIDDEN);
    };
  }, [open, anchor, align, matchWidth]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target))
        onClose();
    };
    const closeEscape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('touchstart', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('touchstart', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div {...props} ref={panel} className={`floating-panel ${className}`} style={style}>
      {children}
    </div>,
    document.body,
  );
}
