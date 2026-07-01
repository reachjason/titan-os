import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Prefs, Theme } from "../types";
import { useGtm } from "../store/useGtm";
import { useGtmGroups } from "../store/useGtmGroups";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  prefs: Prefs;
  onToggleTimestamps: () => void;
  onToggleTags: () => void;
  onAddTaskTag: (tag: string) => void;
  onRemoveTaskTag: (tag: string) => void;
  knownTags: string[];
  onExport: () => void;
  onImport: () => void;
  onShowHelp: () => void;
  onClose: () => void;
}

type Section = "general" | "mcp" | "gtm";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "⚙" },
  { id: "mcp", label: "MCP", icon: "⌁" },
  { id: "gtm", label: "Go to Market", icon: "📣" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`switch${on ? " switch-on" : ""}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function SettingsModal({
  theme,
  onToggleTheme,
  prefs,
  onToggleTimestamps,
  onToggleTags,
  onAddTaskTag,
  onRemoveTaskTag,
  knownTags,
  onExport,
  onImport,
  onShowHelp,
  onClose,
}: Props) {
  const [section, setSection] = useState<Section>("general");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpEnsured, setMcpEnsured] = useState(false);
  const mcpAccess = useQuery(api.mcp.getAccess);
  const ensureMcpKey = useAction(api.mcp.ensureKey);
  const rotateMcpKey = useAction(api.mcp.rotateKey);
  const revokeMcpKey = useMutation(api.mcp.revokeKey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mint the MCP key on demand the first time the MCP section is opened.
  useEffect(() => {
    if (section === "mcp" && mcpAccess && !mcpAccess.key && !mcpEnsured) {
      setMcpEnsured(true);
      void ensureMcpKey({});
    }
  }, [ensureMcpKey, mcpAccess, mcpEnsured, section]);

  const addTag = () => {
    onAddTaskTag(draft);
    setDraft("");
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Copy failed");
    }
    window.setTimeout(() => setCopied(null), 1400);
  };

  const rotate = async () => {
    setMcpBusy(true);
    try {
      await rotateMcpKey({});
      setCopied("Key rotated");
    } finally {
      setMcpBusy(false);
      window.setTimeout(() => setCopied(null), 1400);
    }
  };

  const revoke = async () => {
    setMcpBusy(true);
    try {
      await revokeMcpKey({});
      setCopied("Key revoked");
    } finally {
      setMcpBusy(false);
      window.setTimeout(() => setCopied(null), 1400);
    }
  };

  const suggestions = knownTags.filter((t) => !prefs.taskTags.includes(t));
  const mcpKey = mcpAccess?.key?.secret ?? "";
  const keyDisplay = mcpAccess ? mcpKey || "No active key" : "Loading...";
  const bearerHeader = mcpKey ? `Authorization: Bearer ${mcpKey}` : "";

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal modal-split"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <nav className="set-nav" aria-label="Settings sections">
          <div className="set-nav-title">Settings</div>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`set-nav-item${section === n.id ? " set-nav-on" : ""}`}
              onClick={() => setSection(n.id)}
              aria-current={section === n.id ? "page" : undefined}
            >
              <span className="set-nav-icon" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="set-pane">
          <div className="modal-head">
            <h2 className="modal-title">{NAV.find((n) => n.id === section)?.label}</h2>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="set-pane-body">
            {section === "general" && (
              <>
                <div className="set-row">
                  <div className="set-label">
                    Dark mode
                    <span className="set-sub">Switch between light and dark.</span>
                  </div>
                  <Toggle on={theme === "dark"} onClick={onToggleTheme} />
                </div>

                <div className="set-row">
                  <div className="set-label">
                    Show timestamps
                    <span className="set-sub">
                      Faint time on each row. <code>t c</code>
                    </span>
                  </div>
                  <Toggle on={prefs.showTimestamps} onClick={onToggleTimestamps} />
                </div>

                <div className="set-row">
                  <div className="set-label">
                    Show tags
                    <span className="set-sub">
                      Tag chips on each row. <code>t t</code>
                    </span>
                  </div>
                  <Toggle on={prefs.showTags} onClick={onToggleTags} />
                </div>

                <div className="set-block">
                  <div className="set-label">
                    Task tags
                    <span className="set-sub">Entries with these tags get a checkbox.</span>
                  </div>
                  <div className="tasktag-chips">
                    {prefs.taskTags.map((t) => (
                      <button
                        key={t}
                        className="tasktag"
                        onClick={() => onRemoveTaskTag(t)}
                        title="Remove"
                      >
                        /{t} <span className="tasktag-x">✕</span>
                      </button>
                    ))}
                    <input
                      list="known-tags"
                      className="tasktag-input"
                      placeholder="add a tag…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    <datalist id="known-tags">
                      {suggestions.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <button className="ghost-btn" onClick={addTag}>
                      Add
                    </button>
                  </div>
                </div>

                <div className="set-actions">
                  <button className="ghost-btn" onClick={onExport}>
                    Export JSON
                  </button>
                  <button className="ghost-btn" onClick={onImport}>
                    Import JSON
                  </button>
                  <button className="ghost-btn" onClick={onShowHelp}>
                    Keyboard shortcuts
                  </button>
                </div>
              </>
            )}

            {section === "mcp" && (
              <>
                <div className="set-block">
                  <div className="set-label">
                    MCP access
                    <span className="set-sub">
                      Remote LLM access to your visible Titan entries.
                    </span>
                  </div>
                  <div className="mcp-panel">
                    <label className="mcp-field">
                      <span>Endpoint</span>
                      <div className="mcp-copyrow">
                        <input readOnly value={mcpAccess?.endpoint ?? "Loading..."} />
                        <button
                          className="ghost-btn"
                          onClick={() =>
                            mcpAccess?.endpoint && copy("Endpoint", mcpAccess.endpoint)
                          }
                          disabled={!mcpAccess?.endpoint}
                        >
                          Copy
                        </button>
                      </div>
                    </label>

                    <label className="mcp-field">
                      <span>Bearer key</span>
                      <div className="mcp-copyrow">
                        <input readOnly value={keyDisplay} />
                        <button
                          className="ghost-btn"
                          onClick={() => mcpKey && copy("Key", mcpKey)}
                          disabled={!mcpKey || mcpBusy}
                        >
                          Copy
                        </button>
                      </div>
                    </label>

                    <label className="mcp-field">
                      <span>Header</span>
                      <div className="mcp-copyrow">
                        <input readOnly value={bearerHeader || "Authorization: Bearer ..."} />
                        <button
                          className="ghost-btn"
                          onClick={() => bearerHeader && copy("Header", bearerHeader)}
                          disabled={!bearerHeader || mcpBusy}
                        >
                          Copy
                        </button>
                      </div>
                    </label>

                    <div className="mcp-actions">
                      <button className="ghost-btn" onClick={rotate} disabled={mcpBusy}>
                        Rotate key
                      </button>
                      <button
                        className="ghost-btn"
                        onClick={revoke}
                        disabled={!mcpKey || mcpBusy}
                      >
                        Revoke
                      </button>
                      {copied && <span className="mcp-status">{copied}</span>}
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === "gtm" && <GtmSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Go-to-Market settings: manage broadcast category tags and the linked Telegram
 * account. Reads the same useGtm/useGtmGroups stores as the GTM view (shared
 * localStorage + lock singleton + Convex query), so it stays in sync.
 */
function GtmSettings() {
  const gtm = useGtm();
  const gg = useGtmGroups();
  const [draft, setDraft] = useState("");
  const linked = gtm.state.pinSet;

  const addCat = () => {
    const cat = gtm.registerCat(draft);
    if (cat) setDraft("");
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect this Telegram account? Your cached groups are cleared and you'll re-link via QR to connect a different account."
      )
    )
      return;
    await gtm.disconnect(); // wipes the encrypted session vault + re-locks
    gg.clearAll(); // drop the cached groups (and their photos) in Convex
  };

  return (
    <>
      <div className="set-block">
        <div className="set-label">
          Broadcast categories
          <span className="set-sub">
            Tags you can group Telegram broadcast targets under.
          </span>
        </div>
        <div className="tasktag-chips">
          {gtm.state.catOrder.map((c) => (
            <button
              key={c}
              className="tasktag"
              onClick={() => gtm.removeCat(c)}
              title="Remove category"
            >
              {c} <span className="tasktag-x">✕</span>
            </button>
          ))}
          <input
            className="tasktag-input"
            placeholder="add a category…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCat();
              }
            }}
          />
          <button className="ghost-btn" onClick={addCat}>
            Add
          </button>
        </div>
        {gtm.state.catOrder.length === 0 && (
          <span className="set-sub set-sub-block">
            No categories yet — add one, or create them inline while categorizing groups.
          </span>
        )}
      </div>

      <div className="set-block">
        <div className="set-label">
          Telegram account
          <span className="set-sub">
            {linked ? (
              <>
                Linked as <strong className="gtm-handle">{gtm.handle}</strong>.
              </>
            ) : (
              "No account linked. Open the GTM tab to connect one."
            )}
          </span>
        </div>
        {linked && (
          <div className="set-actions">
            <button className="ghost-btn danger-btn" onClick={() => void disconnect()}>
              Disconnect account
            </button>
          </div>
        )}
      </div>
    </>
  );
}
