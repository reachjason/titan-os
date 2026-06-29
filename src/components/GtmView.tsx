import { useContext, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ThemeContext } from "../store/ThemeContext";
import { useGtm, NOT_ADMIN, type GtmGroup } from "../store/useGtm";
import { useGtmGroups } from "../store/useGtmGroups";
import { categoryColor } from "../lib/gtmCategories";
import { runBroadcast, sendTestToSelf, type BroadcastTarget } from "../lib/broadcast";

/**
 * GTM · Go-to-Market broadcast tool. Connect Telegram, sync the groups you're
 * in, tag them into categories, and broadcast one message to every group in a
 * category. Group metadata is cached in Convex (useGtmGroups); the connect →
 * unlock lifecycle + per-device UI prefs live in useGtm. Broadcast sending is
 * still simulated until Phase 3 wires real Telegram. Mirrors the design
 * prototype's two-pane + persistent-compose-dock layout on Titan's theme tokens.
 */

type ActiveCat = "all" | "uncat" | string;

export function GtmView({ onToast }: { onToast: (msg: string) => void }) {
  const theme = useContext(ThemeContext);
  const gtm = useGtm();
  const { state } = gtm;
  const gg = useGtmGroups();
  const groups = gg.groups;

  // ---- transient UI state (not persisted) ----
  const [activeCat, setActiveCat] = useState<ActiveCat>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [tested, setTested] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ---- connect / unlock flow ----
  const [handleDraft, setHandleDraft] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  // Connect sub-step: collect PIN → show QR (live) → optional 2FA prompt.
  const [connectStep, setConnectStep] = useState<"pin" | "qr">("pin");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [twoFa, setTwoFa] = useState<{ resolve: (pw: string) => void } | null>(null);
  const [twoFaInput, setTwoFaInput] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [newGroupsDismissed, setNewGroupsDismissed] = useState(false);
  const sendTimer = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const catColor = (cat: string) => categoryColor(cat, theme);
  const chipStyle = (cat: string) => {
    const c = catColor(cat);
    return { background: c.bg, color: c.fg };
  };

  useEffect(() => () => window.clearInterval(sendTimer.current), []);

  // ---- derived data ----
  // Cesto-only toggle: when on, restrict to groups whose name/handle contains
  // the keyword (default "cesto"). Everything below derives from this base.
  const kw = state.filter.trim().toLowerCase();
  const baseGroups = useMemo(() => {
    if (!state.cestoOnly || !kw) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(kw) || g.handle.toLowerCase().includes(kw)
    );
  }, [groups, state.cestoOnly, kw]);

  const countFor = (cid: string) => baseGroups.filter((g) => g.cats.includes(cid)).length;
  const uncatCount = baseGroups.filter((g) => g.cats.length === 0).length;

  const visibleGroups = useMemo(() => {
    return baseGroups.filter((g) =>
      activeCat === "all"
        ? true
        : activeCat === "uncat"
          ? g.cats.length === 0
          : g.cats.includes(activeCat)
    );
  }, [baseGroups, activeCat]);

  const viewIds = visibleGroups.map((g) => g.id);
  const allInView = viewIds.length > 0 && viewIds.every((i) => selected.includes(i));
  const recipients = groups
    .filter((g) => selected.includes(g.id))
    .reduce((a, g) => a + g.members, 0);
  const canSend = selected.length > 0 && message.trim().length > 0;
  const commas = (n: number) => n.toLocaleString("en-US");

  // ---- actions ----
  const toggleSelect = (id: string) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  const selectAllView = () =>
    setSelected((sel) =>
      allInView
        ? sel.filter((i) => !viewIds.includes(i))
        : Array.from(new Set([...sel, ...viewIds]))
    );

  const broadcastCat = (cid: string) => {
    const ids = groups.filter((g) => g.cats.includes(cid)).map((g) => g.id);
    setSelected(ids);
    setActiveCat(cid);
    onToast(`Selected ${ids.length} ${cid} group${ids.length === 1 ? "" : "s"}`);
  };

  const clearSelection = () => {
    setSelected([]);
    setBulkOpen(false);
  };

  const onTest = async () => {
    if (!canSend) return;
    try {
      await sendTestToSelf(message); // also refreshes the unlock window
      setTested(true);
      onToast("Test delivered to your Saved Messages");
    } catch (e) {
      onToast(
        (e as Error)?.message === "LOCKED" ? "Unlock first" : "Test failed — " + (e as Error)?.message
      );
    }
  };

  const openReview = () => {
    if (!canSend) return;
    setConfirmed(false);
    setReviewOpen(true);
  };

  const stopSend = () => abortRef.current?.abort();

  const doSend = async () => {
    if (!confirmed || sending) return;
    const targets: BroadcastTarget[] = groups
      .filter((g) => selected.includes(g.id))
      .map((g) => ({ tgId: g.tgId, name: g.name }));
    const total = targets.length;
    setSending(true);
    setSentCount(0);
    setSentTotal(total);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await runBroadcast(
        targets,
        message,
        (p) => {
          if (p.status === "sent") setSentCount((n) => n + 1);
        },
        ctrl.signal
      );
      if (result.reason === "peer_flood") {
        onToast(`Stopped: Telegram flagged the account (PEER_FLOOD) after ${result.sent}. Wait / contact @SpamBot.`);
      } else if (result.aborted) {
        onToast(`Stopped after ${result.sent} of ${total}`);
      } else {
        onToast(`Broadcast sent to ${result.sent} group${result.sent === 1 ? "" : "s"}`);
        setReviewOpen(false);
        setSelected([]);
        setMessage("");
        setTested(false);
        setConfirmed(false);
      }
    } catch (e) {
      onToast(
        (e as Error)?.message === "LOCKED" ? "Unlock first to send" : "Send failed — " + (e as Error)?.message
      );
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const bulkToggle = async (cid: string) => {
    const n = selected.length;
    const added = await gg.bulkToggleCat(selected, cid);
    onToast(`${added ? "Added " : "Removed "}${cid}${added ? " to " : " from "}${n} group${n === 1 ? "" : "s"}`);
  };

  // =========================================================================
  // CONNECT — link Telegram by QR, then set a broadcast PIN
  // =========================================================================
  if (state.phase === "loggedOut") {
    const pinReady = pinDraft.trim().length >= 4;
    // Kick off the real QR login: move to the QR step, then drive linkTelegram
    // with callbacks that render the live QR and bridge the 2FA prompt to the UI.
    const startLink = (pin: string) => {
      setConnectStep("qr");
      setQrDataUrl(null);
      setLinkError(null);
      void gtm
        .linkTelegram(pin, handleDraft, {
          onUrl: async (url) => {
            try {
              setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 320 }));
            } catch {
              /* keep prior QR if rendering hiccups */
            }
          },
          getPassword: () =>
            new Promise<string>((resolve) => {
              setTwoFaInput("");
              setTwoFa({ resolve });
            }),
        })
        .then((err) => {
          setTwoFa(null);
          if (err) {
            setLinkError(err);
          } else {
            setPinDraft("");
            onToast("Linked · enter your PIN to unlock");
          }
        });
    };
    return (
      <div className="gtm-root gtm-connect">
        <div className="gtm-connect-card">
          <div className="gtm-status-line">
            <span className="gtm-dot gtm-dot-amber" />
            TELEGRAM · NOT CONNECTED
          </div>
          {connectStep === "pin" ? (
            <>
              <h1 className="gtm-display">Set a broadcast PIN</h1>
              <p className="gtm-lede">
                Pick a PIN that encrypts your Telegram connection on this device — you'll enter it
                once per session to send. Forget it and you simply re-link; there's no recovery.
                Next you'll scan a QR code to link Telegram.
              </p>
              <div className="gtm-field">
                <label className="gtm-field-label">broadcast PIN</label>
                <input
                  className="gtm-input gtm-pin-input"
                  type="password"
                  inputMode="numeric"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                  placeholder="••••"
                />
              </div>
              <div className="gtm-field">
                <label className="gtm-field-label">
                  your handle <span className="gtm-faint">(optional label)</span>
                </label>
                <input
                  className="gtm-input"
                  value={handleDraft}
                  onChange={(e) => setHandleDraft(e.target.value)}
                  placeholder="@jason"
                />
              </div>
              <div className="gtm-connect-actions">
                <button
                  className="gtm-btn gtm-btn-primary"
                  disabled={!pinReady}
                  onClick={() => startLink(pinDraft)}
                >
                  Link Telegram →
                </button>
                {!pinReady && <span className="gtm-hint">at least 4 characters</span>}
              </div>
            </>
          ) : (
            <>
              <h1 className="gtm-display">Scan to link Telegram</h1>
              <p className="gtm-lede">
                Open Telegram on your phone → <strong>Settings → Devices → Link Desktop
                Device</strong>, then scan this code. Titan never sees your password.
              </p>
              <div className="gtm-qr-wrap">
                {qrDataUrl ? (
                  <img className="gtm-qr-img" src={qrDataUrl} alt="Telegram login QR code" />
                ) : (
                  <div className="gtm-qr" aria-label="Generating QR code">
                    <div className="gtm-qr-glyph gtm-spin">⟳</div>
                    <span className="gtm-qr-caption gtm-mono">generating…</span>
                  </div>
                )}
              </div>
              {twoFa && (
                <div className="gtm-field">
                  <label className="gtm-field-label">two-factor password</label>
                  <input
                    className="gtm-input"
                    type="password"
                    autoFocus
                    value={twoFaInput}
                    onChange={(e) => setTwoFaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && twoFaInput) {
                        twoFa.resolve(twoFaInput);
                        setTwoFa(null);
                      }
                    }}
                    placeholder="your Telegram 2FA password"
                  />
                  <div className="gtm-connect-actions">
                    <button
                      className="gtm-btn gtm-btn-primary"
                      disabled={!twoFaInput}
                      onClick={() => {
                        twoFa.resolve(twoFaInput);
                        setTwoFa(null);
                      }}
                    >
                      Submit →
                    </button>
                  </div>
                </div>
              )}
              {linkError && <div className="gtm-pin-err gtm-sm">{linkError}</div>}
              <div className="gtm-connect-actions">
                <button
                  className="gtm-textbtn"
                  onClick={() => {
                    setConnectStep("pin");
                    setQrDataUrl(null);
                    setTwoFa(null);
                    setLinkError(null);
                  }}
                >
                  ← back
                </button>
              </div>
            </>
          )}
          <div className="gtm-footnote">
            <span className="gtm-mono">⌁</span> Encrypted on this device · the session never reaches
            Titan's servers
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LOCKED — enter the broadcast PIN to unlock this session
  // =========================================================================
  if (state.phase === "locked") {
    const tryUnlock = async () => {
      if (await gtm.unlock(unlockPin)) {
        setUnlockPin("");
        setPinError(false);
        onToast("Unlocked · 30:00");
      } else {
        setPinError(true);
      }
    };
    return (
      <div className="gtm-root gtm-connect">
        <div className="gtm-connect-card">
          <div className="gtm-status-line">
            <span className="gtm-dot gtm-dot-amber" />
            TELEGRAM · LOCKED
          </div>
          <h1 className="gtm-display">Enter your PIN</h1>
          <p className="gtm-lede">
            Linked as <strong className="gtm-handle">{gtm.handle}</strong>. Unlock to sync and
            broadcast. Your unlock lasts 30 minutes and never leaves this tab.
          </p>
          <div className="gtm-field">
            <label className="gtm-field-label">broadcast PIN</label>
            <input
              className={`gtm-input gtm-pin-input${pinError ? " gtm-input-error" : ""}`}
              type="password"
              inputMode="numeric"
              autoFocus
              value={unlockPin}
              onChange={(e) => {
                setUnlockPin(e.target.value);
                if (pinError) setPinError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="••••"
            />
          </div>
          {pinError && <div className="gtm-pin-err gtm-sm">Incorrect PIN — try again.</div>}
          <div className="gtm-connect-actions">
            <button className="gtm-btn gtm-btn-primary" disabled={!unlockPin} onClick={tryUnlock}>
              Unlock →
            </button>
            <button className="gtm-textbtn" onClick={() => void gtm.disconnect()}>
              use a different account
            </button>
          </div>
          <div className="gtm-footnote gtm-faint gtm-sm">
            <span className="gtm-mono">⌁</span> Decrypts on this device · forgot it? re-link via QR
          </div>
        </div>
      </div>
    );
  }

  // Connbar with the live unlock pill, shared by the empty and main views.
  const newGroupCount = groups.filter((g) => g.isNew).length;
  const dismissNewGroups = () => {
    setNewGroupsDismissed(true);
    gg.clearNew(); // persist: clear the isNew flags in Convex
  };
  const renderConnbar = () => (
    <div className="gtm-connbar">
      <span className="gtm-connbar-status">
        <span className="gtm-dot gtm-dot-green" />
        Connected as <strong className="gtm-handle">{gtm.handle}</strong>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={state.cestoOnly}
        className={`gtm-toggle${state.cestoOnly ? " gtm-toggle-on" : ""}`}
        onClick={() => gtm.setField("cestoOnly", !state.cestoOnly)}
        title="Show only groups matching “cesto”"
      >
        <span className="gtm-toggle-track">
          <span className="gtm-toggle-thumb" />
        </span>
        Cesto only
      </button>
      <span className="gtm-connbar-right">
        <span className="gtm-ttl-pill" title="Unlocked for this session — re-locks automatically when idle">
          <span className="gtm-ttl-lock">🔓</span> Unlocked
        </span>
        <button className="gtm-textbtn" onClick={gtm.lockNow}>
          lock now
        </button>
      </span>
    </div>
  );

  const renderNewGroupsBanner = () =>
    newGroupCount > 0 && !newGroupsDismissed ? (
      <div className="gtm-newgroups-banner">
        <span>
          <span className="gtm-newgroups-spark">✦</span> Found{" "}
          <strong>
            {newGroupCount} new group{newGroupCount === 1 ? "" : "s"}
          </strong>{" "}
          since your last sync.
        </span>
        <button className="gtm-textbtn" onClick={dismissNewGroups}>
          dismiss
        </button>
      </div>
    ) : null;

  // =========================================================================
  // EMPTY (unlocked, not synced)
  // =========================================================================
  if (!gg.synced) {
    return (
      <div className="gtm-root">
        {renderConnbar()}
        <div className="gtm-empty">
          <div className="gtm-empty-icon">⤓</div>
          <div className="gtm-display gtm-display-sm">No groups synced yet</div>
          <p className="gtm-lede gtm-lede-center">
            We'll fetch every group and channel whose title matches your filter.
          </p>
          <div className="gtm-filter-pill">
            <span className="gtm-mono gtm-faint">title contains</span>
            <span className="gtm-filter-token">{state.filter}</span>
            <span className="gtm-faint gtm-sm">case-insensitive</span>
            <button className="gtm-filter-edit" onClick={() => setSettingsOpen(true)}>
              edit
            </button>
          </div>
          <button
            className="gtm-btn gtm-btn-primary gtm-btn-lg"
            onClick={() => gg.sync(onToast)}
          >
            <span className={gg.syncing ? "gtm-spin" : ""}>⟳</span>{" "}
            {gg.syncing ? "Syncing…" : "Sync from Telegram"}
          </button>
          <div className="gtm-faint gtm-sm gtm-empty-foot">
            First sync may take a moment depending on how many groups you're in.
          </div>
        </div>
        {settingsOpen && renderSettings()}
      </div>
    );
  }

  // =========================================================================
  // MAIN — two-pane + persistent compose dock
  // =========================================================================

  // Left rail rows
  const railRows: {
    key: string;
    label: string;
    count: number;
    isCat: boolean;
    active: boolean;
    dotColor: string;
    onClick: () => void;
    onBroadcast?: () => void;
  }[] = [];
  railRows.push({
    key: "all",
    label: "All groups",
    count: baseGroups.length,
    isCat: false,
    active: activeCat === "all",
    dotColor: "var(--ink-faint)",
    onClick: () => setActiveCat("all"),
  });
  state.catOrder.forEach((cid) => {
    const cnt = countFor(cid);
    if (cnt === 0) return;
    railRows.push({
      key: cid,
      label: cid,
      count: cnt,
      isCat: true,
      active: activeCat === cid,
      dotColor: catColor(cid).fg,
      onClick: () => setActiveCat(cid),
      onBroadcast: () => broadcastCat(cid),
    });
  });
  if (uncatCount > 0) {
    railRows.push({
      key: "uncat",
      label: "Uncategorized",
      count: uncatCount,
      isCat: false,
      active: activeCat === "uncat",
      dotColor: "var(--dot)",
      onClick: () => setActiveCat("uncat"),
    });
  }

  const headerIsCat = activeCat !== "all" && activeCat !== "uncat";
  const headerLabel = activeCat === "all" ? "All groups" : activeCat === "uncat" ? "Uncategorized" : activeCat;

  function renderSettings() {
    return (
      <div className="gtm-modal-scrim" onClick={() => setSettingsOpen(false)}>
        <div className="gtm-modal gtm-modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="gtm-modal-head">
            <div className="gtm-display gtm-display-sm">GTM settings</div>
            <button className="gtm-x" onClick={() => setSettingsOpen(false)}>
              ✕
            </button>
          </div>
          <label className="gtm-field-label">
            sync filter — title contains (case-insensitive)
          </label>
          <input
            className="gtm-input"
            value={state.filter}
            onChange={(e) => gtm.setField("filter", e.target.value)}
          />
          <p className="gtm-faint gtm-sm gtm-mt8">
            Only groups whose title contains this keyword are fetched on sync.
          </p>
          <div className="gtm-settings-row">
            <div>
              <div className="gtm-settings-title">Telegram</div>
              <div className="gtm-faint gtm-sm">Connected as {gtm.handle}</div>
            </div>
            <button
              className="gtm-btn gtm-btn-ghost gtm-btn-danger"
              onClick={() => {
                gtm.disconnect();
                setSettingsOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
          <div className="gtm-settings-row">
            <div>
              <div className="gtm-settings-title">Reset demo</div>
              <div className="gtm-faint gtm-sm">Clear local state &amp; replay from connect</div>
            </div>
            <button
              className="gtm-btn gtm-btn-ghost"
              onClick={() => {
                gtm.reset();
                gg.clearAll(); // also drop the cached groups in Convex
                setActiveCat("all");
                setSelected([]);
                setMessage("");
                setTested(false);
                setSettingsOpen(false);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sheetGroup = sheetId ? groups.find((g) => g.id === sheetId) : null;
  const selGroups = groups.filter((g) => selected.includes(g.id));

  return (
    <div className="gtm-root gtm-main">
      {renderConnbar()}
      {renderNewGroupsBanner()}
      <div className="gtm-panes">
        {/* LEFT RAIL */}
        <aside className="gtm-rail">
          <div className="gtm-rail-head">
            <span className="gtm-mono gtm-eyebrow">CATEGORIES</span>
            <span className="gtm-mono gtm-faint gtm-sm">{groups.length} total</span>
          </div>
          <div className="gtm-rail-list">
            {railRows.map((r) => (
              <div key={r.key} className={`gtm-rail-row${r.active ? " gtm-rail-on" : ""}`}>
                <span className="gtm-rail-label" onClick={r.onClick}>
                  <span className="gtm-rail-dot" style={{ background: r.dotColor }} />
                  <span className="gtm-ellipsis">{r.label}</span>
                </span>
                {r.isCat && r.onBroadcast && (
                  <button
                    className="gtm-rail-broadcast"
                    title="Broadcast to this category"
                    onClick={r.onBroadcast}
                  >
                    ↗
                  </button>
                )}
                <span className="gtm-mono gtm-faint gtm-rail-count">{r.count}</span>
              </div>
            ))}
          </div>
          <div className="gtm-rail-foot">
            <span className="gtm-faint gtm-sm">{groups.length} groups cached</span>
            <button className="gtm-btn gtm-btn-ghost gtm-btn-sm" onClick={() => gg.sync(onToast)}>
              <span className={gg.syncing ? "gtm-spin" : ""}>⟳</span> Sync
            </button>
          </div>
        </aside>

        {/* RIGHT LIST */}
        <section className="gtm-list-pane">
          <div className="gtm-list-head">
            <div className="gtm-list-title">
              {headerIsCat ? (
                <span className="gtm-chip gtm-chip-lg" style={chipStyle(activeCat)}>
                  {headerLabel}
                </span>
              ) : (
                <span className="gtm-display gtm-display-xs">{headerLabel}</span>
              )}
              <span className="gtm-mono gtm-faint gtm-sm">
                · {visibleGroups.length} group{visibleGroups.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="gtm-list-actions">
              <button className="gtm-textbtn" onClick={selectAllView}>
                {allInView ? "clear selection" : "select all"}
              </button>
              {selected.length > 0 && (
                <span className="gtm-bulk-wrap">
                  <span className="gtm-mono gtm-handle gtm-sm">{selected.length} selected</span>
                  <button className="gtm-btn gtm-btn-soft gtm-btn-sm" onClick={() => setBulkOpen((o) => !o)}>
                    ＋ Categorize ▾
                  </button>
                  <button className="gtm-textbtn" onClick={clearSelection}>
                    clear
                  </button>
                  {bulkOpen && (
                    <>
                      <div className="gtm-popover-scrim" onClick={() => setBulkOpen(false)} />
                      <BulkPopover
                        count={selected.length}
                        catOrder={state.catOrder}
                        selGroups={selGroups}
                        chipStyle={chipStyle}
                        catColor={catColor}
                        onToggle={bulkToggle}
                        onAddNew={async (text) => {
                          const cat = gtm.registerCat(text);
                          if (!cat) return;
                          const n = selected.length;
                          await gg.bulkToggleCat(selected, cat);
                          onToast(`Added ${cat} to ${n} group${n === 1 ? "" : "s"}`);
                        }}
                      />
                    </>
                  )}
                </span>
              )}
              {headerIsCat && (
                <button className="gtm-btn gtm-btn-ghost gtm-btn-accent gtm-btn-sm" onClick={() => broadcastCat(activeCat)}>
                  broadcast to {headerLabel} →
                </button>
              )}
            </div>
          </div>

          <div className="gtm-list-rows">
            {visibleGroups.map((g) => {
              const sel = selected.includes(g.id);
              const avatar = g.cats[0] ? chipStyle(g.cats[0]) : undefined;
              return (
                <div key={g.id} className={`gtm-grow${sel ? " gtm-grow-on" : ""}`}>
                  <span
                    className={`gtm-check${sel ? " gtm-check-on" : ""}`}
                    onClick={() => toggleSelect(g.id)}
                  >
                    {sel ? "✓" : ""}
                  </span>
                  {g.photoUrl ? (
                    <img className="gtm-avatar gtm-avatar-img" src={g.photoUrl} alt="" />
                  ) : (
                    <div className="gtm-avatar" style={avatar}>
                      {(g.name.trim()[0] || "?").toUpperCase()}
                    </div>
                  )}
                  <div className="gtm-grow-meta" onClick={() => toggleSelect(g.id)}>
                    <div className="gtm-grow-name">{g.name}</div>
                    <div className="gtm-mono gtm-faint gtm-sm">
                      {g.members} members{g.handle ? ` · ${g.handle}` : ""}
                    </div>
                  </div>
                  {g.isNew && <span className="gtm-badge-new">new</span>}
                  <div className="gtm-grow-chips">
                    {g.cats.map((c) => (
                      <span key={c} className="gtm-chip" style={chipStyle(c)}>
                        {c}
                      </span>
                    ))}
                    {g.cats.length === 0 && (
                      <button className="gtm-chip-add" onClick={() => setSheetId(g.id)}>
                        + categorize
                      </button>
                    )}
                  </div>
                  <button className="gtm-grow-edit" title="Edit categories" onClick={() => setSheetId(g.id)}>
                    ⋯
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* COMPOSE DOCK */}
      <div className="gtm-dock">
        <div className="gtm-dock-target">
          <span className="gtm-mono gtm-faint gtm-sm">Broadcast</span>
          <span className={`gtm-mono gtm-sm${selected.length > 0 ? " gtm-handle" : " gtm-faint"}`}>
            {selected.length > 0
              ? `${selected.length} groups · ~${commas(recipients)}`
              : "nothing selected"}
          </span>
        </div>
        <input
          className="gtm-dock-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write once, send to every selected group…"
        />
        <button className="gtm-btn gtm-btn-ghost" disabled={!canSend} onClick={onTest}>
          Test to myself
        </button>
        <button className="gtm-btn gtm-btn-primary" disabled={!canSend} onClick={openReview}>
          Review &amp; send →
        </button>
      </div>

      {/* CATEGORIZE SHEET */}
      {sheetGroup && (
        <CategorizeSheet
          group={sheetGroup}
          catOrder={state.catOrder}
          chipStyle={chipStyle}
          catColor={catColor}
          onToggle={(cid) => gg.toggleGroupCat(sheetGroup.id, cid)}
          onAddNew={(text) => {
            const cat = gtm.registerCat(text);
            if (cat) gg.toggleGroupCat(sheetGroup.id, cat);
          }}
          onClose={() => setSheetId(null)}
        />
      )}

      {/* REVIEW MODAL */}
      {reviewOpen && (
        <ReviewModal
          selGroups={selGroups}
          recipients={commas(recipients)}
          message={message}
          handle={gtm.handle}
          tested={tested}
          sending={sending}
          sentCount={sentCount}
          sentTotal={sentTotal}
          confirmed={confirmed}
          onToggleConfirm={() => setConfirmed((c) => !c)}
          onSend={doSend}
          onStop={stopSend}
          onClose={() => !sending && setReviewOpen(false)}
        />
      )}

      {settingsOpen && renderSettings()}
    </div>
  );
}

// ===========================================================================
// SUBCOMPONENTS
// ===========================================================================

function BulkPopover({
  count,
  catOrder,
  selGroups,
  chipStyle,
  catColor,
  onToggle,
  onAddNew,
}: {
  count: number;
  catOrder: string[];
  selGroups: GtmGroup[];
  chipStyle: (c: string) => { background: string; color: string };
  catColor: (c: string) => { bg: string; fg: string };
  onToggle: (cid: string) => void;
  onAddNew: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAddNew(text);
    setText("");
  };
  return (
    <div className="gtm-popover" onClick={(e) => e.stopPropagation()}>
      <div className="gtm-mono gtm-eyebrow gtm-mb">TAG {count} SELECTED GROUPS</div>
      <div className="gtm-chip-pick">
        {catOrder.map((c) => {
          const have = selGroups.filter((g) => g.cats.includes(c)).length;
          const all = selGroups.length > 0 && have === selGroups.length;
          const some = have > 0 && !all;
          const color = catColor(c);
          return (
            <button
              key={c}
              className={`gtm-pick${all ? " gtm-pick-on" : some ? " gtm-pick-some" : ""}`}
              style={
                all
                  ? { ...chipStyle(c), outline: `1px solid ${color.fg}` }
                  : some
                    ? { borderColor: color.fg, color: color.fg }
                    : undefined
              }
              onClick={() => onToggle(c)}
            >
              {c}
              {some ? ` ${have}/${selGroups.length}` : ""}
            </button>
          );
        })}
      </div>
      <div className="gtm-inline-add">
        <input
          className="gtm-input gtm-input-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="+ new category…"
        />
        <button className="gtm-btn gtm-btn-primary gtm-btn-sm" onClick={add}>
          Add
        </button>
      </div>
      <div className="gtm-faint gtm-sm gtm-mt8">
        Tap a category to add it to all selected · tap again to remove.
      </div>
    </div>
  );
}

function CategorizeSheet({
  group,
  catOrder,
  chipStyle,
  catColor,
  onToggle,
  onAddNew,
  onClose,
}: {
  group: GtmGroup;
  catOrder: string[];
  chipStyle: (c: string) => { background: string; color: string };
  catColor: (c: string) => { bg: string; fg: string };
  onToggle: (cid: string) => void;
  onAddNew: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const avatar = group.cats[0] ? chipStyle(group.cats[0]) : undefined;
  const add = () => {
    if (!text.trim()) return;
    onAddNew(text);
    setText("");
  };
  return (
    <div className="gtm-sheet-scrim">
      <div className="gtm-sheet-rest" onClick={onClose} />
      <div className="gtm-sheet">
        <div className="gtm-sheet-head">
          <div className="gtm-sheet-id">
            {group.photoUrl ? (
              <img className="gtm-avatar gtm-avatar-lg gtm-avatar-img" src={group.photoUrl} alt="" />
            ) : (
              <div className="gtm-avatar gtm-avatar-lg" style={avatar}>
                {(group.name.trim()[0] || "?").toUpperCase()}
              </div>
            )}
            <div>
              <div className="gtm-sheet-name">{group.name}</div>
              <div className="gtm-mono gtm-faint gtm-sm">
                {group.members} members{group.handle ? ` · ${group.handle}` : ""}
              </div>
            </div>
          </div>
          <button className="gtm-x" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="gtm-mono gtm-eyebrow gtm-sheet-section">CATEGORIES</div>
        <div className="gtm-sheet-current">
          {group.cats.map((c) => (
            <span key={c} className="gtm-chip gtm-chip-md" style={chipStyle(c)}>
              {c}{" "}
              <span className="gtm-chip-x" onClick={() => onToggle(c)}>
                ×
              </span>
            </span>
          ))}
          {group.cats.length === 0 && (
            <span className="gtm-faint gtm-sm gtm-italic">No categories yet — pick below.</span>
          )}
        </div>

        <div className="gtm-mono gtm-eyebrow gtm-sheet-section">ADD</div>
        <div className="gtm-chip-pick">
          {catOrder.map((c) => {
            const on = group.cats.includes(c);
            const color = catColor(c);
            return (
              <button
                key={c}
                className={`gtm-pick${on ? " gtm-pick-on" : ""}`}
                style={on ? { ...chipStyle(c), outline: `1px solid ${color.fg}` } : undefined}
                onClick={() => onToggle(c)}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="gtm-inline-add gtm-mt12">
          <input
            className="gtm-input gtm-input-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="+ new category…"
          />
          <button className="gtm-btn gtm-btn-ghost gtm-btn-sm" onClick={add}>
            Add
          </button>
        </div>
        <div className="gtm-faint gtm-sm gtm-mt8">
          Categories drive broadcast targeting. One group can hold many.
        </div>
        <button className="gtm-btn gtm-btn-primary gtm-btn-block gtm-mt16" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function ReviewModal({
  selGroups,
  recipients,
  message,
  handle,
  tested,
  sending,
  sentCount,
  sentTotal,
  confirmed,
  onToggleConfirm,
  onSend,
  onStop,
  onClose,
}: {
  selGroups: GtmGroup[];
  recipients: string;
  message: string;
  handle: string;
  tested: boolean;
  sending: boolean;
  sentCount: number;
  sentTotal: number;
  confirmed: boolean;
  onToggleConfirm: () => void;
  onSend: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const count = selGroups.length;
  const eta = count + "s";
  const pct = sentTotal ? Math.round((sentCount / sentTotal) * 100) : 0;
  return (
    <div className="gtm-modal-scrim" onClick={onClose}>
      <div className="gtm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gtm-modal-head">
          <div className="gtm-display gtm-display-sm">Review broadcast</div>
          <button className="gtm-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gtm-faint gtm-sm gtm-mb">
          Sending to{" "}
          <strong className="gtm-handle">
            {count} group{count === 1 ? "" : "s"}
          </strong>{" "}
          · ~{recipients} recipients
        </div>
        <div className="gtm-msg-preview">{message}</div>
        <div className="gtm-mono gtm-eyebrow gtm-mb">RECIPIENTS · PER-GROUP PREVIEW</div>
        <div className="gtm-recipients">
          {selGroups.map((g) => {
            const warn = NOT_ADMIN.has(g.id);
            return (
              <div key={g.id} className="gtm-recipient">
                <span className={`gtm-recip-icon${warn ? " gtm-recip-warn" : ""}`}>
                  {warn ? "!" : "✓"}
                </span>
                <span className="gtm-recip-name">
                  {g.name}
                  {warn && <span className="gtm-recip-note"> · not admin, sends as member</span>}
                </span>
                <span className="gtm-mono gtm-faint gtm-sm">
                  {warn ? "" : "admin · "}
                  {g.members}
                </span>
              </div>
            );
          })}
        </div>
        <div className="gtm-review-notes">
          <div className={`gtm-note${tested ? " gtm-note-ok" : " gtm-note-pending"}`}>
            {tested
              ? `✓ Test message delivered to ${handle}`
              : "○ No dry-run yet — close and hit “Test to myself” to preview delivery"}
          </div>
          <div className="gtm-note gtm-note-warn">
            ⚠ Telegram rate limit ~1 msg/sec · estimated {eta} to send all
          </div>
        </div>

        {sending ? (
          <div className="gtm-progress-wrap">
            <div className="gtm-mono gtm-sm gtm-progress-label">
              <span>Sending…</span>
              <span>
                {sentCount} / {sentTotal}
              </span>
            </div>
            <div className="gtm-progress-track">
              <div className="gtm-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="gtm-modal-actions">
              <button className="gtm-btn gtm-btn-ghost gtm-btn-danger" onClick={onStop}>
                Stop
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="gtm-confirm" onClick={onToggleConfirm}>
              <span className={`gtm-check gtm-check-md${confirmed ? " gtm-check-on" : ""}`}>
                {confirmed ? "✓" : ""}
              </span>
              I've reviewed the message and recipients
            </label>
            <div className="gtm-modal-actions">
              <button className="gtm-btn gtm-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="gtm-btn gtm-btn-primary" disabled={!confirmed} onClick={onSend}>
                Send to {count} groups
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
