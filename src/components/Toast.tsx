import { useEffect } from "react";

interface Props {
  message: string;
  onDone: () => void;
  /** Auto-dismiss after this many ms. */
  duration?: number;
}

/** Brief inline feedback ("Logged /todo", "Exported JSON"). */
export function Toast({ message, onDone, duration = 1900 }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(id);
  }, [message, duration, onDone]);

  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
