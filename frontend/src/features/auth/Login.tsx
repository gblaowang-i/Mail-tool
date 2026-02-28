import { FormEvent, useEffect, useState } from "react";
import axios from "axios";
import { setApiToken } from "../../api/client";

const AUTH_CONFIG_URL = "/api/auth/config";
const LOGIN_URL = "/api/auth/login";
const RESET_PASSWORD_URL = "/api/auth/reset-password";

export interface LoginProps {
  onSuccess: () => void;
}

type AuthView = "login" | "reset";

export const Login = ({ onSuccess }: LoginProps) => {
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetAvailable, setResetAvailable] = useState(false);

  useEffect(() => {
    axios.get<{ reset_available?: boolean }>(AUTH_CONFIG_URL).then((res) => {
      setResetAvailable(!!res.data?.reset_available);
    }).catch(() => {});
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await axios.post<{ access_token: string }>(LOGIN_URL, {
        username: username.trim(),
        password
      });
      const token = res.data?.access_token;
      if (token) {
        setApiToken(token);
        onSuccess();
      } else {
        setError("登录响应异常");
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      const detail = ax.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "登录失败，请检查用户名和密码");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== newPasswordConfirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    setLoading(true);
    try {
      await axios.post(RESET_PASSWORD_URL, {
        reset_token: resetToken.trim(),
        new_password: newPassword
      });
      setSuccess("密码已重置，请使用新密码登录");
      setResetToken("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setTimeout(() => {
        setView("login");
        setSuccess(null);
      }, 2000);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(typeof ax.response?.data?.detail === "string" ? ax.response.data.detail : "重置失败，请检查重置令牌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <div className="auth-card">
          <div className="auth-logo" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          {view === "login" ? (
            <>
              <h2>登录</h2>
              <p className="auth-subtitle">使用管理员账号登录 MailAggregator 控制台</p>
              <form className="auth-form" onSubmit={handleLogin}>
                <div className="auth-field">
                  <label htmlFor="login-username">用户名</label>
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    disabled={loading}
                    placeholder="管理员用户名"
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="login-password">密码</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    placeholder="登录密码"
                  />
                </div>
                {error && <p className="auth-error">{error}</p>}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? "登录中…" : "登录"}
                </button>
                {resetAvailable && (
                  <p className="auth-links">
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => { setView("reset"); setError(null); setSuccess(null); }}
                    >
                      忘记密码？使用重置令牌
                    </button>
                  </p>
                )}
              </form>
            </>
          ) : (
            <>
              <h2>重置密码</h2>
              <p className="auth-subtitle">在 .env 中配置 ADMIN_RESET_TOKEN 后，在此填写令牌与新密码</p>
              <form className="auth-form" onSubmit={handleReset}>
                <div className="auth-field">
                  <label htmlFor="reset-token">重置令牌</label>
                  <input
                    id="reset-token"
                    type="password"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    autoComplete="off"
                    required
                    disabled={loading}
                    placeholder="与 .env 中 ADMIN_RESET_TOKEN 一致"
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="reset-new">新密码</label>
                  <input
                    id="reset-new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    placeholder="至少 6 位"
                    minLength={6}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="reset-confirm">确认新密码</label>
                  <input
                    id="reset-confirm"
                    type="password"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    placeholder="再次输入新密码"
                    minLength={6}
                  />
                </div>
                {error && <p className="auth-error">{error}</p>}
                {success && <p className="auth-success">{success}</p>}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? "提交中…" : "重置密码"}
                </button>
                <p className="auth-links">
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => { setView("login"); setError(null); setSuccess(null); }}
                  >
                    返回登录
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
