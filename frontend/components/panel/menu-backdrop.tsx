"use client";

export function PanelMenuBackdrop({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close menu"
      onClick={onClick}
      className="fixed inset-0 z-40 cursor-default bg-background/20 backdrop-blur-[2px]"
    />
  );
}
