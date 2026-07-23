"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Music2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import styles from "./admin.module.css";

type Summary = {
  users: number;
  balance: number;
  spent: number;
  orders: number;
  completed: number;
  failed: number;
  songs: number;
  processing: number;
};

type UserRow = {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  balance: number;
  totalSpent: number;
  freeCredits: number;
  createdAt: string;
  updatedAt: string;
  orderCount: number;
  transactionCount: number;
  referralCount: number;
  lastOrder: { id: number; status: string; plan: string; createdAt: string } | null;
};

type DashboardResponse = {
  summary: Summary;
  users: UserRow[];
  pagination: { page: number; take: number; total: number; pages: number };
};

type UserDetail = UserRow & {
  languageCode: string;
  orders: Array<{
    id: number;
    status: string;
    plan: string;
    recipientName: string;
    trackTitle: string | null;
    amount: number;
    errorMessage: string | null;
    createdAt: string;
    songs: Array<{ id: number; title: string; duration: number | null; qualityScore: number | null; createdAt: string }>;
  }>;
  transactions: Array<{
    id: number;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }>;
  _count: { orders: number; transactions: number; referrals: number; songDrafts: number; voiceProfiles: number };
};

const EMPTY_SUMMARY: Summary = { users: 0, balance: 0, spent: 0, orders: 0, completed: 0, failed: 0, songs: 0, processing: 0 };

const statusLabels: Record<string, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачен",
  PROCESSING: "В работе",
  ENHANCING: "Подготовка текста",
  GENERATING: "Генерация",
  COMPLETED: "Готов",
  FAILED: "Ошибка",
  REFUNDING: "Возврат",
  REFUNDED: "Возвращён",
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value / 100) + " ₽";
}

function date(value: string, withTime = false) {
  return new Intl.DateTimeFormat("ru-RU", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }
  ).format(new Date(value));
}

function initials(user: Pick<UserRow, "firstName" | "lastName">) {
  return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "SC";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ошибка запроса");
  return payload as T;
}

export function AdminDashboard({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [data, setData] = useState<DashboardResponse>({ summary: EMPTY_SUMMARY, users: [], pagination: { page: 1, take: 50, total: 0, pages: 1 } });
  const [loading, setLoading] = useState(initialAuthenticated);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ query, filter, sort, page: String(page) });
      setData(await api<DashboardResponse>(`/api/songcraft/admin/users?${params}`));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось загрузить данные";
      if (message === "Unauthorized") setAuthenticated(false);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [authenticated, filter, page, query, sort]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      setDetail(await api<UserDetail>(`/api/songcraft/admin/users/${id}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить пользователя");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadUsers, query ? 260 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadUsers, query]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [loadDetail, selectedId]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      await api("/api/songcraft/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setAuthenticated(true);
    } catch (requestError) {
      setLoginError(requestError instanceof Error ? requestError.message : "Не удалось войти");
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/songcraft/admin/session", { method: "DELETE" });
    setAuthenticated(false);
    setSelectedId(null);
  }

  async function changedBalance() {
    if (selectedId) await loadDetail(selectedId);
    await loadUsers();
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginPanel}>
          <div className={styles.loginBrand}><AudioLines aria-hidden="true" /> SongCraft <span>Control</span></div>
          <div className={styles.loginCopy}>
            <span className={styles.eyebrow}><ShieldCheck size={15} /> Защищённый доступ</span>
            <h1>Управление сервисом</h1>
            <p>Пользователи, балансы, заказы и история операций в одном месте.</p>
          </div>
          <form className={styles.loginForm} onSubmit={login}>
            <label htmlFor="admin-password">Пароль администратора</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              autoFocus
            />
            {loginError && <p className={styles.formError}>{loginError}</p>}
            <button type="submit" disabled={loginLoading || !password}>
              {loginLoading ? <LoaderCircle className={styles.spin} size={19} /> : <ShieldCheck size={19} />}
              Войти в панель
            </button>
          </form>
          <p className={styles.loginFoot}>Сессия закрывается автоматически через 12 часов.</p>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}><AudioLines aria-hidden="true" /><strong>SongCraft</strong><span>Control</span></div>
        <div className={styles.topbarActions}>
          <span className={styles.live}><i /> Сервис онлайн</span>
          <button className={styles.iconButton} onClick={logout} title="Выйти"><LogOut size={18} /></button>
        </div>
      </header>

      <main className={styles.workspace}>
        <section className={styles.heading}>
          <div>
            <span className={styles.eyebrow}><UsersRound size={15} /> Пользователи</span>
            <h1>Управление клиентами</h1>
            <p>Балансы, активность и история заказов SongCraft.</p>
          </div>
          <button className={styles.refreshButton} onClick={loadUsers} disabled={loading}>
            <RefreshCw size={17} className={loading ? styles.spin : ""} /> <span>Обновить</span>
          </button>
        </section>

        <section className={styles.metrics} aria-label="Сводка">
          <Metric icon={<UsersRound />} label="Пользователей" value={String(data.summary.users)} note={`${data.summary.orders} заказов`} />
          <Metric icon={<WalletCards />} label="На балансах" value={money(data.summary.balance)} note="доступно клиентам" />
          <Metric icon={<CircleDollarSign />} label="Потрачено" value={money(data.summary.spent)} note={`${data.summary.completed} завершено`} />
          <Metric icon={<Music2 />} label="Готовых треков" value={String(data.summary.songs)} note={data.summary.processing ? `${data.summary.processing} сейчас в работе` : "очередь свободна"} />
        </section>

        <section className={styles.directory}>
          <div className={styles.directoryTop}>
            <div>
              <h2>Все пользователи</h2>
              <p>{data.pagination.total} найдено</p>
            </div>
            <div className={styles.controls}>
              <label className={styles.searchBox}>
                <Search size={17} />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Имя, @username или Telegram ID" />
                {query && <button onClick={() => setQuery("")} title="Очистить поиск"><X size={15} /></button>}
              </label>
              <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Сортировка">
                <option value="newest">Сначала новые</option>
                <option value="balance">По балансу</option>
                <option value="spent">По расходам</option>
              </select>
            </div>
          </div>

          <div className={styles.filters}>
            {[
              ["all", "Все"],
              ["customers", "Платившие"],
              ["balance", "С балансом"],
              ["issues", "С ошибками"],
            ].map(([value, label]) => (
              <button key={value} className={filter === value ? styles.activeFilter : ""} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>
            ))}
          </div>

          {error && <div className={styles.errorBanner}><AlertTriangle size={17} />{error}<button onClick={loadUsers}>Повторить</button></div>}

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Пользователь</th><th>Баланс</th><th>Потрачено</th><th>Заказы</th><th>Последняя активность</th><th aria-label="Открыть" /></tr></thead>
              <tbody className={loading ? styles.loadingRows : ""}>
                {!loading && data.users.length === 0 && <tr><td colSpan={6} className={styles.empty}>Ничего не найдено</td></tr>}
                {data.users.map((user) => (
                  <tr key={user.id} onClick={() => setSelectedId(user.id)}>
                    <td>
                      <div className={styles.userCell}><span className={styles.avatar}>{initials(user)}</span><span><strong>{user.firstName} {user.lastName || ""}</strong><small>{user.username ? `@${user.username}` : `ID ${user.telegramId}`}</small></span></div>
                    </td>
                    <td data-label="Баланс"><strong className={styles.balance}>{money(user.balance)}</strong></td>
                    <td data-label="Потрачено">{money(user.totalSpent)}</td>
                    <td data-label="Заказы"><span className={styles.orderCount}>{user.orderCount}</span>{user.lastOrder && <Status value={user.lastOrder.status} />}</td>
                    <td data-label="Активность">{date(user.updatedAt, true)}</td>
                    <td><ChevronRight size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div className={styles.tableLoader}><LoaderCircle className={styles.spin} /> Загружаем пользователей</div>}
          </div>

          {data.pagination.pages > 1 && (
            <div className={styles.pagination}>
              <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} title="Предыдущая страница"><ChevronLeft size={18} /></button>
              <span>{page} / {data.pagination.pages}</span>
              <button onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))} disabled={page >= data.pagination.pages} title="Следующая страница"><ChevronRight size={18} /></button>
            </div>
          )}
        </section>
      </main>

      {selectedId && (
        <div className={styles.drawerLayer} role="dialog" aria-modal="true" aria-label="Пользователь">
          <div className={styles.drawerBackdrop} onClick={() => setSelectedId(null)} aria-hidden="true" />
          <aside className={styles.drawer}>
            <button className={styles.drawerClose} onClick={() => setSelectedId(null)} title="Закрыть"><X size={20} /></button>
            {detailLoading || !detail ? <div className={styles.detailLoader}><LoaderCircle className={styles.spin} /> Загружаем профиль</div> : <UserInspector user={detail} onBalanceChanged={changedBalance} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className={styles.metric}><span className={styles.metricIcon}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></div>;
}

function Status({ value }: { value: string }) {
  return <span className={`${styles.status} ${styles[`status${value}`] || ""}`}>{statusLabels[value] || value}</span>;
}

function UserInspector({ user, onBalanceChanged }: { user: UserDetail; onBalanceChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("300");
  const [reason, setReason] = useState("Ручная корректировка баланса");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const fullName = `${user.firstName} ${user.lastName || ""}`.trim();
  const telegramLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.telegramId}`;
  const numericAmount = Math.abs(Number(amount) || 0);
  const nextBalance = user.balance + (mode === "credit" ? numericAmount : -numericAmount) * 100;

  async function submitBalance(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFormError("");
    try {
      await api(`/api/songcraft/admin/users/${user.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRub: mode === "credit" ? numericAmount : -numericAmount, reason }),
      });
      setMessage(mode === "credit" ? `Начислено ${numericAmount} ₽` : `Списано ${numericAmount} ₽`);
      await onBalanceChanged();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Не удалось изменить баланс");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.inspector}>
      <header className={styles.profileHeader}>
        <span className={styles.largeAvatar}>{initials(user)}</span>
        <div><span className={styles.profileId}>Пользователь #{user.id}</span><h2>{fullName}</h2><a href={telegramLink} target="_blank" rel="noreferrer">{user.username ? `@${user.username}` : `Telegram ID ${user.telegramId}`} <ExternalLink size={14} /></a></div>
      </header>

      <div className={styles.profileStats}>
        <span><small>Баланс</small><strong>{money(user.balance)}</strong></span>
        <span><small>Потрачено</small><strong>{money(user.totalSpent)}</strong></span>
        <span><small>Заказов</small><strong>{user._count.orders}</strong></span>
        <span><small>Черновиков</small><strong>{user._count.songDrafts}</strong></span>
      </div>

      <form className={styles.balanceEditor} onSubmit={submitBalance}>
        <div className={styles.sectionTitle}><span><Banknote size={18} /> Изменить баланс</span><small>После операции: {money(nextBalance)}</small></div>
        <div className={styles.modeSwitch}>
          <button type="button" className={mode === "credit" ? styles.modeActive : ""} onClick={() => setMode("credit")}>Начислить</button>
          <button type="button" className={mode === "debit" ? styles.modeActive : ""} onClick={() => setMode("debit")}>Списать</button>
        </div>
        <div className={styles.amountPresets}>
          {[300, 1000, 5000].map((value) => <button key={value} type="button" className={Number(amount) === value ? styles.presetActive : ""} onClick={() => setAmount(String(value))}>{value.toLocaleString("ru-RU")} ₽</button>)}
        </div>
        <label className={styles.field}><span>Сумма, ₽</span><input type="number" min="1" max="50000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label className={styles.field}><span>Комментарий</span><input value={reason} maxLength={180} onChange={(event) => setReason(event.target.value)} /></label>
        {formError && <p className={styles.formError}>{formError}</p>}
        {message && <p className={styles.formSuccess}>{message}</p>}
        <button className={styles.applyButton} type="submit" disabled={saving || numericAmount < 1 || nextBalance < 0 || reason.trim().length < 2}>
          {saving ? <LoaderCircle className={styles.spin} size={18} /> : mode === "credit" ? <Sparkles size={18} /> : <Banknote size={18} />}
          {mode === "credit" ? "Начислить" : "Списать"} {numericAmount || 0} ₽
        </button>
      </form>

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}><span><Music2 size={18} /> Последние заказы</span><small>{user._count.orders} всего</small></div>
        <div className={styles.orderList}>
          {user.orders.length === 0 && <p className={styles.mutedEmpty}>Заказов пока нет</p>}
          {user.orders.map((order) => (
            <article key={order.id} className={styles.orderItem}>
              <div><strong>#{order.id} · {order.trackTitle || `Для ${order.recipientName}`}</strong><small>{order.plan} · {money(order.amount)} · {date(order.createdAt, true)}</small></div>
              <Status value={order.status} />
              {order.errorMessage && <p className={styles.orderError}>{order.errorMessage}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}><span><Clock3 size={18} /> История баланса</span><small>{user._count.transactions} операций</small></div>
        <div className={styles.transactionList}>
          {user.transactions.length === 0 && <p className={styles.mutedEmpty}>Операций пока нет</p>}
          {user.transactions.map((transaction) => {
            const positive = transaction.amount > 0 && ["REFUND", "REFERRAL_BONUS", "ADMIN_CREDIT"].includes(transaction.type);
            return <div key={transaction.id} className={styles.transactionItem}><span className={positive ? styles.transactionIn : transaction.amount < 0 ? styles.transactionOut : ""}>{positive ? "+" : ""}{money(transaction.amount)}</span><div><strong>{transaction.description}</strong><small>{date(transaction.createdAt, true)}</small></div></div>;
          })}
        </div>
      </section>

      <footer className={styles.profileFooter}><UserRound size={15} /> Регистрация {date(user.createdAt)} · {user.referralCount || user._count.referrals} приглашённых</footer>
    </div>
  );
}
