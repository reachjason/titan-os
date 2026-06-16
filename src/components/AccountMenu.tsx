import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

interface Props {
  /** Called after sign-out is triggered (e.g. to close the menu / toast). */
  onSignOut: () => void;
  onClose: () => void;
}

/** Small popover under the avatar: signed-in user + Sign out. */
export function AccountMenu({ onSignOut, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);

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

  const name = user?.name || user?.email || "Account";
  const initial = (name[0] || "?").toUpperCase();
  const sub = user?.email && user?.name ? user.email : "Signed in with GitHub";

  const handleSignOut = () => {
    void signOut();
    onSignOut();
  };

  return (
    <div className="account-menu" ref={ref} role="menu">
      <div className="account-head">
        {user?.image ? (
          <img className="account-avatar account-avatar-img" src={user.image} alt="" />
        ) : (
          <div className="account-avatar">{initial}</div>
        )}
        <div className="account-id">
          <span className="account-email">{name}</span>
          <span className="account-sub">{sub}</span>
        </div>
      </div>
      <div className="account-divider" />
      <button className="account-item" onClick={handleSignOut} role="menuitem">
        <span aria-hidden="true">⎋</span> Sign out
      </button>
    </div>
  );
}
