import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AccountPollStatus,
  CreateAccountPayload,
  EmailAccount,
  TelegramFilterRule,
  apiClient
} from "../../api/client";
import { MAIL_PROVIDERS, MailProviderKey } from "../../config/mailProviders";

type ModalMode = "create" | "edit";
// sortKey = "manual" 时，按照当前数组顺序（包括拖动后的顺序）展示。
type SortKey = "manual" | "email" | "provider" | "host" | "port" | "last_success_at";

interface Props {
  selectedAccountId: number | null;
  onSelectAccount: (id: number | null) => void;
}

export const AccountList = ({ selectedAccountId, onSelectAccount }: Props) => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<number, AccountPollStatus>>({});
  const [expandedErrorFor, setExpandedErrorFor] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providerKey, setProviderKey] = useState<MailProviderKey>("gmail");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateAccountPayload & { telegram_push_enabled?: boolean; push_template?: string; poll_interval_seconds?: number | null }>({
    email: "",
    provider: "gmail",
    host: "imap.gmail.com",
    port: 993,
    is_active: true,
    app_password: "",
    telegram_push_enabled: true,
    push_template: "short",
    poll_interval_seconds: null
  });
  const [pushRules, setPushRules] = useState<TelegramFilterRule[]>([]);
  const [newRule, setNewRule] = useState({ field: "sender" as const, mode: "allow" as const, value: "" });
  const [addingRule, setAddingRule] = useState(false);

  const fetchAccounts = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const [accRes, statusRes] = await Promise.all([
        apiClient.get<EmailAccount[]>("/accounts/"),
        apiClient.get<AccountPollStatus[]>("/accounts/status")
      ]);
      setAccounts(accRes.data);
      const map: Record<number, AccountPollStatus> = {};
      for (const s of statusRes.data) map[s.account_id] = s;
      setStatusMap(map);
    } catch (e) {
      if (!silent) {
        setError("加载账号失败");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // 首次加载显示 loading，之后每 15s 静默刷新状态与错误信息。
    fetchAccounts();
    const id = window.setInterval(() => {
      fetchAccounts(true);
    }, 15000);
    return () => window.clearInterval(id);
  }, [fetchAccounts]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const sortedAccounts = sortKey === "manual" ? accounts : [...accounts].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getLastOk = (id: number) => {
      const st = statusMap[id];
      const raw = (st?.last_success_at as any) ?? (st?.last_finished_at as any) ?? null;
      if (!raw) return 0;
      const ts = new Date(raw as string).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };

    let av: string | number = 0;
    let bv: string | number = 0;

    switch (sortKey) {
      case "email":
        av = a.email.toLowerCase();
        bv = b.email.toLowerCase();
        break;
      case "provider":
        av = (a.provider || "").toLowerCase();
        bv = (b.provider || "").toLowerCase();
        break;
      case "host":
        av = (a.host || "").toLowerCase();
        bv = (b.host || "").toLowerCase();
        break;
      case "port":
        av = a.port || 0;
        bv = b.port || 0;
        break;
      case "last_success_at":
        av = getLastOk(a.id);
        bv = getLastOk(b.id);
        break;
      default:
        av = 0;
        bv = 0;
    }

    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const visibleIds = useMemo(() => sortedAccounts.map((a) => a.id), [sortedAccounts]);
  const allVisibleChecked = useMemo(() => {
    if (visibleIds.length === 0) return false;
    for (const id of visibleIds) {
      if (!checkedIds.has(id)) return false;
    }
    return true;
  }, [checkedIds, visibleIds]);
  const someVisibleChecked = useMemo(() => {
    for (const id of visibleIds) {
      if (checkedIds.has(id)) return true;
    }
    return false;
  }, [checkedIds, visibleIds]);
  const indeterminate = someVisibleChecked && !allVisibleChecked;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const uncheckAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  };

  const checkedList = useMemo(() => Array.from(checkedIds), [checkedIds]);

  const bulkSetActive = async (active: boolean) => {
    if (checkedList.length === 0) return;
    setBulkAction(active ? "批量启用" : "批量停用");
    try {
      await Promise.all(
        checkedList.map((id) => apiClient.patch(`/accounts/${id}`, { is_active: active }).catch(() => null))
      );
      await fetchAccounts();
    } finally {
      setBulkAction(null);
    }
  };

  const bulkFetchOnce = async () => {
    if (checkedList.length === 0) return;
    setBulkAction("批量拉取一次");
    try {
      await Promise.all(
        checkedList.map((id) => apiClient.post(`/emails/accounts/${id}/fetch_once`).catch(() => null))
      );
      await fetchAccounts();
    } finally {
      setBulkAction(null);
    }
  };

  const bulkDelete = async () => {
    if (checkedList.length === 0) return;
    const ok = window.confirm(`确认删除选中的 ${checkedList.length} 个账号？（会同时删除其邮件记录与规则）`);
    if (!ok) return;
    setBulkAction("批量删除");
    try {
      await Promise.all(
        checkedList.map((id) => apiClient.delete(`/accounts/${id}`).catch(() => null))
      );
      // 若当前查看账号被删掉，清空选择
      if (selectedAccountId && checkedIds.has(selectedAccountId)) {
        onSelectAccount(null);
      }
      setCheckedIds(new Set());
      await fetchAccounts();
    } finally {
      setBulkAction(null);
    }
  };

  const applyReorder = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;

    const fromIndex = sortedAccounts.findIndex((a) => a.id === sourceId);
    const toIndex = sortedAccounts.findIndex((a) => a.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newOrder = [...sortedAccounts];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    setAccounts(newOrder);
    setSortKey("manual");
    setSortDir("asc");

    try {
      await Promise.all(
        newOrder.map((acc, index) =>
          apiClient.patch(`/accounts/${acc.id}`, { sort_order: index }).catch(() => null)
        )
      );
    } catch {
      setError("更新排序失败");
    }
  };

  const openCreate = () => {
    setProviderKey("gmail");
    setModalMode("create");
    setEditingId(null);
    setForm({
      email: "",
      provider: "gmail",
      host: "imap.gmail.com",
      port: 993,
      is_active: true,
      app_password: "",
      telegram_push_enabled: true,
      push_template: "short",
      poll_interval_seconds: null
    });
    setFormError(null);
    setPushRules([]);
    setShowModal(true);
  };

  const openEdit = async (acc: EmailAccount) => {
    setModalMode("edit");
    setEditingId(acc.id);
    setProviderKey((acc.provider as MailProviderKey) || "custom");
    setForm({
      email: acc.email,
      provider: (acc.provider as MailProviderKey) || "custom",
      host: acc.host,
      port: acc.port,
      is_active: acc.is_active,
      app_password: "",
      telegram_push_enabled: acc.telegram_push_enabled !== false,
      push_template: acc.push_template || "short",
      poll_interval_seconds: acc.poll_interval_seconds ?? null
    });
    setFormError(null);
    setShowModal(true);
    try {
      const res = await apiClient.get<TelegramFilterRule[]>(`/accounts/${acc.id}/telegram-rules`);
      setPushRules(res.data);
    } catch {
      setPushRules([]);
    }
  };

  const toggleActive = async (acc: EmailAccount) => {
    try {
      await apiClient.patch(`/accounts/${acc.id}`, { is_active: !acc.is_active });
      await fetchAccounts();
    } catch {
      setError("更新账号状态失败");
    }
  };

  const deleteAccount = async (acc: EmailAccount) => {
    const ok = window.confirm(`确认删除账号：${acc.email} ？`);
    if (!ok) return;
    try {
      await apiClient.delete(`/accounts/${acc.id}`);
      if (selectedAccountId === acc.id) onSelectAccount(null);
      await fetchAccounts();
    } catch {
      setError("删除账号失败");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      setFormError(null);
      if (modalMode === "create") {
        if (!form.email || !form.app_password) {
          setFormError("邮箱和授权码必填");
          return;
        }
        await apiClient.post<EmailAccount>("/accounts/", form);
      } else {
        if (!editingId) {
          setFormError("未知账号");
          return;
        }
        // Edit: password optional; email is immutable (backend doesn't accept it).
        const payload: any = {
          host: form.host,
          port: form.port,
          is_active: form.is_active,
          telegram_push_enabled: form.telegram_push_enabled,
          push_template: form.push_template,
          poll_interval_seconds: form.poll_interval_seconds || null
        };
        if (form.app_password) payload.app_password = form.app_password;
        await apiClient.patch(`/accounts/${editingId}`, payload);
      }
      setShowModal(false);
      await fetchAccounts();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = (err.response.data as any)?.detail;
        if (typeof detail === "string") {
          setFormError(`创建账号失败：${detail}`);
        } else {
          setFormError("创建账号失败，请检查参数");
        }
      } else {
        setFormError("创建账号失败，请检查参数");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>邮箱账号</h2>
          <p className="card-subtitle">在这里管理你要监控的邮箱账号</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "flex-end" }}>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            已选择 <b>{checkedList.length}</b> 项
          </span>
          <button className="secondary-btn" type="button" onClick={checkAllVisible} disabled={visibleIds.length === 0}>
            全选
          </button>
          <button className="secondary-btn" type="button" onClick={uncheckAllVisible} disabled={!someVisibleChecked}>
            取消全选
          </button>
          <button className="secondary-btn" type="button" onClick={() => bulkSetActive(true)} disabled={checkedList.length === 0 || !!bulkAction}>
            {bulkAction === "批量启用" ? "启用中..." : "批量启用"}
          </button>
          <button className="secondary-btn" type="button" onClick={() => bulkSetActive(false)} disabled={checkedList.length === 0 || !!bulkAction}>
            {bulkAction === "批量停用" ? "停用中..." : "批量停用"}
          </button>
          <button className="secondary-btn" type="button" onClick={bulkFetchOnce} disabled={checkedList.length === 0 || !!bulkAction}>
            {bulkAction === "批量拉取一次" ? "拉取中..." : "批量拉取一次"}
          </button>
          <button className="secondary-btn danger" type="button" onClick={bulkDelete} disabled={checkedList.length === 0 || !!bulkAction}>
            {bulkAction === "批量删除" ? "删除中..." : "批量删除"}
          </button>
          <button className="primary-btn" onClick={openCreate} disabled={!!bulkAction}>
            新建账号
          </button>
        </div>
      </header>

      {loading && <p className="muted">加载中...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && accounts.length === 0 && (
        <p className="muted">还没有任何账号，请先通过 API 创建。</p>
      )}

      {!loading && !error && accounts.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => (e.target.checked ? checkAllVisible() : uncheckAllVisible())}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="全选/取消全选"
                />
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("email")}
              >
                邮箱{renderSortIndicator("email")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("provider")}
              >
                类型{renderSortIndicator("provider")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("host")}
              >
                IMAP Host{renderSortIndicator("host")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("port")}
              >
                端口{renderSortIndicator("port")}
              </th>
              <th>轮询频率</th>
              <th>状态</th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("last_success_at")}
              >
                最近拉取{renderSortIndicator("last_success_at")}
              </th>
              <th>最近错误</th>
              <th className="col-actions" style={{ width: 200 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map((acc) => (
              (() => {
                let providerKeyForRow: MailProviderKey =
                  (acc.provider as MailProviderKey) || "custom";
                // 如果用户把 host 改成自定义 IMAP，但 provider 还留着默认 gmail，
                // 仅在展示标签时按「自定义」处理，避免误导。
                if (providerKeyForRow === "gmail" && acc.host !== "imap.gmail.com") {
                  providerKeyForRow = "custom";
                }
                const providerPreset =
                  MAIL_PROVIDERS.find((p) => p.key === providerKeyForRow) ||
                  MAIL_PROVIDERS.find((p) => p.key === "custom")!;
                const st = statusMap[acc.id];
                const lastOk = st?.last_success_at ?? st?.last_finished_at ?? null;
                const lastOkText = lastOk ? new Date(lastOk).toLocaleString() : "-";
                const errText = st?.last_error ? String(st.last_error) : "";

                const startedAt = st?.last_started_at ? new Date(st.last_started_at) : null;
                const finishedAt = st?.last_finished_at ? new Date(st.last_finished_at) : null;
                const successAt = st?.last_success_at ? new Date(st.last_success_at) : null;

                // 只在「最近一次轮询刚刚开始且还没结束」时显示为轮询中，
                // 避免旧的 started_at 让状态看起来一直是轮询中。
                const now = new Date();
                const POLL_STALE_MS = 60_000;
                let isPolling = false;
                if (startedAt) {
                  const ageMs = now.getTime() - startedAt.getTime();
                  if (
                    ageMs <= POLL_STALE_MS &&
                    (!finishedAt || startedAt.getTime() > finishedAt.getTime())
                  ) {
                    isPolling = true;
                  }
                }

                // Treat as error only if the latest finished poll failed
                // (no success yet, or last_finished_at > last_success_at) and we have error text.
                const latestFailed =
                  !!finishedAt &&
                  (!successAt || finishedAt.getTime() > successAt.getTime());
                const isError = !!errText && latestFailed;

                const healthBadge = !acc.is_active
                  ? { cls: "badge badge-muted", text: "已停用" }
                  : isPolling
                    ? { cls: "badge badge-warn", text: "轮询中" }
                    : isError
                      ? { cls: "badge badge-danger", text: "异常" }
                      : { cls: "badge badge-success", text: "正常" };

                const isExpanded = expandedErrorFor === acc.id;
                return (
                  <>
                    <tr
                      key={acc.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(acc.id);
                        if (e.dataTransfer) {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(acc.id));
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer) {
                          e.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromData = e.dataTransfer?.getData("text/plain");
                        const sourceId = draggingId ?? (fromData ? Number(fromData) : 0);
                        if (!sourceId || sourceId === acc.id) return;
                        void applyReorder(sourceId, acc.id);
                        setDraggingId(null);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={
                        [
                          "row-selectable",
                          selectedAccountId === acc.id ? "selected" : "",
                          checkedIds.has(acc.id) ? "bulk-selected" : "",
                        ].filter(Boolean).join(" ")
                      }
                      onClick={() =>
                        onSelectAccount(selectedAccountId === acc.id ? null : acc.id)
                      }
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedIds.has(acc.id)}
                          onChange={() => toggleChecked(acc.id)}
                          aria-label={`选择账号 ${acc.email}`}
                        />
                      </td>
                      <td>{acc.email}</td>
                      <td>
                        <span
                          className={`provider-tag provider-${providerKeyForRow}`}
                          title={providerPreset.label}
                        >
                          {providerPreset.label}
                        </span>
                      </td>
                      <td>{acc.host}</td>
                      <td>{acc.port}</td>
                      <td>
                        {acc.poll_interval_seconds
                          ? `${acc.poll_interval_seconds}s`
                          : <span className="muted">默认</span>}
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}
                        >
                          <span
                            className={
                              acc.is_active ? "badge badge-success" : "badge badge-muted"
                            }
                          >
                            {acc.is_active ? "启用" : "停用"}
                          </span>
                          <span className={healthBadge.cls}>{healthBadge.text}</span>
                        </div>
                      </td>
                      <td>{lastOkText}</td>
                      <td className="truncate" title={errText || "-"}>
                        {errText ? (
                          <button
                            className="link-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedErrorFor(isExpanded ? null : acc.id);
                            }}
                            type="button"
                          >
                            {isExpanded ? "收起" : "查看"}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions">
                          <button
                            className="small-btn"
                            onClick={() => toggleActive(acc)}
                            title="启用/停用轮询"
                          >
                            {acc.is_active ? "停用" : "启用"}
                          </button>
                          <button className="small-btn" onClick={() => openEdit(acc)}>
                            编辑
                          </button>
                          <button
                            className="small-btn danger"
                            onClick={() => deleteAccount(acc)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    {errText && isExpanded && (
                      <tr key={`${acc.id}-err`} className="error-row">
                        <td colSpan={10}>
                          <div className="error-box">{errText}</div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <h3>{modalMode === "create" ? "新建邮箱账号" : "编辑邮箱账号"}</h3>
            </header>
            <form className="modal-body" onSubmit={handleSubmit}>
              <section className="form-section">
                <h4 className="form-section-title">基本信息</h4>
              {modalMode === "create" && (
                <label className="field">
                  <span>邮箱服务商</span>
                  <select
                    value={providerKey}
                    onChange={(e) => {
                      const key = e.target.value as MailProviderKey;
                      setProviderKey(key);
                      const preset = MAIL_PROVIDERS.find((p) => p.key === key);
                      if (key === "custom") {
                        // 自定义 IMAP：不要默认成 gmail 的 host，给一个空白起点。
                        setForm((f) => ({
                          ...f,
                          provider: "custom",
                          host: "",
                          port: 993
                        }));
                      } else if (preset) {
                        setForm((f) => ({
                          ...f,
                          provider: key,
                          host: preset.host,
                          port: preset.port
                        }));
                      }
                    }}
                  >
                    {MAIL_PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {providerKey !== "custom" && (
                    <p className="muted">
                      {MAIL_PROVIDERS.find((p) => p.key === providerKey)?.note ??
                        "默认 IMAP 配置，可在下方微调。"}
                    </p>
                  )}
                </label>
              )}
              <label className="field">
                <span>邮箱地址</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                  disabled={modalMode === "edit"}
                />
              </label>
              <label className="field">
                <span>IMAP Host</span>
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="imap.example.com"
                />
              </label>
              <label className="field-inline">
                <span>端口</span>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, port: Number(e.target.value) || 0 }))
                  }
                />
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_active: e.target.checked }))
                    }
                  />
                  启用监控
                </label>
              </label>
              <label className="field">
                <span>轮询间隔（秒）</span>
                <input
                  type="number"
                  min={5}
                  placeholder="留空使用全局默认"
                  value={form.poll_interval_seconds ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setForm((f) => ({
                      ...f,
                      poll_interval_seconds: v === "" ? null : Math.max(5, Number(v) || 5)
                    }));
                  }}
                />
                <p className="muted">
                  留空表示继承全局 POLL_INTERVAL_SECONDS（.env），最小 5 秒。
                </p>
              </label>
              <label className="field">
                <span>邮箱授权码 / 应用密码</span>
                <input
                  type="password"
                  value={form.app_password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, app_password: e.target.value }))
                  }
                  placeholder={
                    modalMode === "create"
                      ? "不会明文存库，仅加密保存"
                      : "留空表示不修改密码"
                  }
                  required={modalMode === "create"}
                />
              </label>
              </section>

              <section className="form-section">
                <h4 className="form-section-title">Telegram 推送</h4>
              <div className="field">
                <span>推送设置</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap"
                  }}
                >
                  <label className="checkbox-inline" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.telegram_push_enabled !== false}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, telegram_push_enabled: e.target.checked }))
                      }
                    />
                    启用推送
                  </label>
                  <span style={{ color: "var(--muted)", fontSize: "0.9em" }}>推送内容</span>
                  <select
                    value={form.push_template || "short"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, push_template: e.target.value }))
                    }
                  >
                    <option value="full_email">推送完整邮件</option>
                    <option value="full">完整摘要</option>
                    <option value="short">短摘要</option>
                    <option value="title_only">仅标题</option>
                  </select>
                </div>
              </div>
              {modalMode === "edit" && editingId && (
                <div className="field">
                  <span>推送规则</span>
                  <p className="muted" style={{ fontSize: "0.85em" }}>
                    无规则时该账号新邮件均推送；可添加允许/拒绝规则按关键字过滤。
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem" }}>
                    {pushRules.map((r) => (
                      <li
                        key={r.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          padding: "0.35rem 0.5rem",
                          marginBottom: "0.25rem",
                          background: "var(--bg-subtle, #f5f5f5)",
                          borderRadius: 4
                        }}
                      >
                        <span className="muted">
                          {r.field === "sender" ? "发件人" : r.field === "domain" ? "域名" : r.field === "subject" ? "主题" : "正文"}{" "}
                          {r.mode === "allow" ? "允许" : "拒绝"} 包含 “{r.value}”
                        </span>
                        <button
                          type="button"
                          className="small-btn danger"
                          onClick={async () => {
                            await apiClient.delete(`/accounts/telegram-rules/${r.id}`);
                            setPushRules((prev) => prev.filter((x) => x.id !== r.id));
                          }}
                        >
                          删除
                        </button>
                      </li>
                    ))}
                    {pushRules.length === 0 && (
                      <li className="muted" style={{ padding: "0.35rem 0" }}>
                        暂无规则
                      </li>
                    )}
                  </ul>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                      marginTop: "0.5rem"
                    }}
                  >
                    <select
                      value={newRule.field}
                      onChange={(e) => setNewRule((r) => ({ ...r, field: e.target.value as "sender" | "domain" | "subject" | "body" }))}
                      style={{ minWidth: 72 }}
                    >
                      <option value="sender">发件人</option>
                      <option value="domain">域名</option>
                      <option value="subject">主题</option>
                      <option value="body">正文</option>
                    </select>
                    <select
                      value={newRule.mode}
                      onChange={(e) => setNewRule((r) => ({ ...r, mode: e.target.value as "allow" | "deny" }))}
                      style={{ minWidth: 100 }}
                    >
                      <option value="allow">允许</option>
                      <option value="deny">拒绝</option>
                    </select>
                    <input
                      type="text"
                      placeholder="关键字"
                      value={newRule.value}
                      onChange={(e) => setNewRule((r) => ({ ...r, value: e.target.value }))}
                      style={{ width: 100, flex: "0 0 auto" }}
                    />
                    <button
                      type="button"
                      className="small-btn"
                      disabled={addingRule || !newRule.value.trim()}
                      onClick={async () => {
                        setAddingRule(true);
                        try {
                          const res = await apiClient.post<TelegramFilterRule>(
                            `/accounts/${editingId}/telegram-rules`,
                            { field: newRule.field, mode: newRule.mode, value: newRule.value.trim(), rule_order: pushRules.length }
                          );
                          setPushRules((prev) => [...prev, res.data]);
                          setNewRule({ field: "sender", mode: "allow", value: "" });
                        } finally {
                          setAddingRule(false);
                        }
                      }}
                    >
                      {addingRule ? "添加中..." : "添加"}
                    </button>
                  </div>
                </div>
              )}
              </section>
              {formError && <p className="error-text">{formError}</p>}
              <footer className="modal-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  取消
                </button>
                <button type="submit" className="primary-btn" disabled={creating}>
                  {creating ? "保存中..." : "确认保存"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

