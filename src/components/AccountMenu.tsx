import { useEffect, useRef } from "react";
import { config } from "../config";

interface Props {
  onSignOut: () => void;
  onClose: () => void;
}

/** Small popover under the avatar: signed-in user + Sign out. */
export function AccountMenu({ onSignOut, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the opening click doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div className="account-menu" ref={ref} role="menu">
      <div className="account-head">
        <div className="account-avatar">{config.account.initial}</div>
        <div className="account-id">
          <span className="account-email">{config.account.email}</span>
          <span className="account-sub">{config.account.subtitle}</span>
        </div>
      </div>
      <div className="account-divider" />
      <button className="account-item" onClick={onSignOut} role="menuitem">
        <span aria-hidden="true">⎋</span> Sign out
      </button>
    </div>
  );
}
