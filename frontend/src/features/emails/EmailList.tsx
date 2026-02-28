import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  EmailListResponse,
  EmailRecord,
  EmailRecordDetail,
  apiClient
} from "../../api/client";

interface Props {
  accountId: number | null;
}

type TimeRangeKey = "all" | "24h" | "7d" | "30d";

export const EmailList = ({ accountId }: Props) => {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecordDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [labelFilter, setLabelFilter] = useState("");
  const [applyingRules, setApplyingRules] = useState(false);

  const fetchEmails = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const params: any = { page, page_size: pageSize };
      if (accountId) params.account_id = accountId;
      if (keyword.trim()) params.keyword = keyword.trim();
      if (readFilter === "unread") params.is_read = false;
      if (readFilter === "read") params.is_read = true;
      if (labelFilter.trim()) params.label = labelFilter.trim();
      if (timeRange !== "all") {
        const now = new Date();
        const toDate = new Date(now);
        toDate.setHours(23, 59, 59, 999);
        const fromDate = new Date(now);
        if (timeRange === "24h") fromDate.setTime(fromDate.getTime() - 24 * 60 * 60 * 1000);
        else if (timeRange === "7d") fromDate.setDate(fromDate.getDate() - 7);
        else fromDate.setDate(fromDate.getDate() - 30);
        fromDate.setHours(0, 0, 0, 0);
        params.date_from = fromDate.toISOString().slice(0, 10);
        params.date_to = toDate.toISOString().slice(0, 10);
      }
      const res = await apiClient.get<EmailListResponse>("/emails/", { params });
      setEmails(res.data.items);
      setTotal(res.data.total);
    } catch (e) {
      if (!silent) setError("加载邮件失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accountId, page, pageSize, keyword, timeRange, readFilter, labelFilter]);

  useEffect(() => {
    setPage(1);
  }, [accountId, keyword, timeRange, readFilter, labelFilter]);

  useEffect(() => {
    fetchEmails();
  }, [accountId, page, fetchEmails]);

  // 自动轮询刷新列表，静默刷新不显示 loading，避免页面跳到顶部。
  useEffect(() => {
    const intervalMs = 20_000;
    const id = window.setInterval(() => {
      if (!loading) {
        fetchEmails(true);
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [fetchEmails, loading]);

  const openDetail = async (id: number) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await apiClient.get<EmailRecordDetail>(`/emails/${id}`);
      setSelectedEmail(res.data);
      setEmails((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_read: true } : m))
      );
    } catch {
      setError("加载邮件详情失败");
    } finally {
      setLoadingDetail(false);
    }
  };

  const applyRulesToExisting = async () => {
    try {
      setApplyingRules(true);
      setError(null);
      const res = await apiClient.post<{ updated: number; total: number }>(
        "/emails/apply-rules"
      );
      await fetchEmails();
      if (res.data.updated !== undefined) {
        setError(null);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = (err.response.data as any)?.detail;
        setError(typeof detail === "string" ? detail : "应用规则失败");
      } else {
        setError("应用规则失败");
      }
    } finally {
      setApplyingRules(false);
    }
  };

  const fetchRemote = async () => {
    if (!accountId) {
      setError("请先在账号管理中选择一个账号");
      return;
    }
    try {
      setFetchingRemote(true);
      setError(null);
      await apiClient.post(`/emails/accounts/${accountId}/fetch_once`);
      await fetchEmails();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const detail = (err.response.data as any)?.detail;
        if (typeof detail === "string") {
          setError(`拉取邮件失败：${detail}`);
        } else {
          setError("拉取邮件失败");
        }
      } else {
        setError("拉取邮件失败");
      }
    } finally {
      setFetchingRemote(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>邮件列表</h2>
          <p className="card-subtitle">
            {accountId
              ? `当前筛选账号 ID：${accountId}`
              : "显示最近邮件，可以在上方账号页选择某个账号后返回这里查看。"}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            placeholder="搜索主题 / 发件人 / 摘要"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), void fetchEmails())}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--input-border)",
              background: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "0.8rem",
              minWidth: 160
            }}
          />
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(e.target.value as TimeRangeKey);
              setPage(1);
            }}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--input-border)",
              background: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "0.8rem"
            }}
          >
            <option value="all">全部时间</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
          <select
            value={readFilter}
            onChange={(e) => {
              setReadFilter(e.target.value as "all" | "unread" | "read");
              setPage(1);
            }}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--input-border)",
              background: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "0.8rem"
            }}
          >
            <option value="all">全部</option>
            <option value="unread">未读</option>
            <option value="read">已读</option>
          </select>
          <input
            type="text"
            placeholder="按标签筛选"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), void fetchEmails())}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--input-border)",
              background: "var(--input-bg)",
              color: "var(--text)",
              fontSize: "0.8rem",
              width: 100
            }}
          />
          <button className="secondary-btn" onClick={() => { setPage(1); fetchEmails(); }}>
            搜索
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={applyRulesToExisting}
            disabled={applyingRules}
            title="刷新并按当前规则重算标签（会清除旧标签），并按规则可选标已读"
          >
            {applyingRules ? "刷新中..." : "刷新（重算标签）"}
          </button>
          <button
            className="primary-btn"
            style={{ paddingInline: "0.8rem", fontSize: "0.75rem" }}
            onClick={fetchRemote}
            disabled={fetchingRemote}
          >
            {fetchingRemote ? "拉取中..." : "从邮箱拉取一次"}
          </button>
        </div>
      </header>

      {loading && <p className="muted">加载中...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && emails.length === 0 && (
        <p className="muted">还没有任何邮件记录。</p>
      )}

      {!loading && !error && emails.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table email-table">
            <thead>
              <tr>
                <th>标签</th>
                <th className="col-time">时间</th>
                <th className="col-account">收件账号</th>
                <th className="col-sender">发件人</th>
                <th className="col-subject">主题</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((m) => (
                <tr
                  key={m.id}
                  className={"row-selectable" + (m.is_read === false ? " email-unread" : "")}
                  onClick={() => openDetail(m.id)}
                >
                  <td className="email-labels-cell">
                    {(m.labels && m.labels.length > 0)
                      ? (
                          <span className="email-labels-wrap">
                            {m.labels.map((l) => (
                              <span key={l} className="badge badge-info" title={l}>
                                {l}
                              </span>
                            ))}
                          </span>
                        )
                      : <span className="email-labels-empty">无</span>}
                  </td>
                  <td className="col-time truncate" title={new Date(m.received_at).toLocaleString()}>
                    {new Date(m.received_at).toLocaleString()}
                  </td>
                  <td className="col-account truncate" title={m.account_email}>
                    {m.account_email}
                  </td>
                  <td className="col-sender truncate" title={m.sender}>
                    {m.sender}
                  </td>
                  <td className="col-subject truncate" title={m.subject}>
                    {m.is_read === false ? <strong>{m.subject}</strong> : m.subject}
                  </td>
                  <td className="truncate">{m.content_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.75rem",
              fontSize: "0.8rem"
            }}
          >
            <span className="muted">
              共 {total} 条 · 第 {page} / {totalPages} 页
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="secondary-btn"
                type="button"
                onClick={goPrev}
                disabled={page <= 1}
              >
                上一页
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={goNext}
                disabled={page >= totalPages}
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}

      {selectedEmail && (
        <div className="modal-backdrop" onClick={() => setSelectedEmail(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header modal-header-row">
              <div style={{ minWidth: 0 }}>
                <h3 className="truncate" title={selectedEmail.subject}>
                  {selectedEmail.subject || "(无主题)"}
                </h3>
                <div className="modal-meta">
                  <span className="truncate" title={selectedEmail.account_email}>
                    收件账号：{selectedEmail.account_email}
                  </span>
                  <span className="truncate" title={selectedEmail.sender}>
                    发件人：{selectedEmail.sender}
                  </span>
                  <span>时间：{new Date(selectedEmail.received_at).toLocaleString()}</span>
                </div>
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setSelectedEmail(null)}
                title="关闭"
              >
                ×
              </button>
            </header>

            <div className="modal-content">
              {loadingDetail ? (
                <p className="muted">加载中...</p>
              ) : (
                <pre className="email-pre">
                  {selectedEmail.body_text ||
                    selectedEmail.content_summary ||
                    "(无可用正文内容)"}
                </pre>
              )}
              <footer className="modal-footer">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => setSelectedEmail(null)}
                >
                  关闭
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

