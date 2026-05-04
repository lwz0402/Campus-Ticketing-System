/* global io */

const outputEl = document.getElementById('cli-output');
const inputEl = document.getElementById('cli-command');
const quickButtons = document.querySelectorAll('.cli-quick-actions button');
const promptEl = document.querySelector('.cli-prompt');

let activeProjectId = null;
let cachedProjects = [];
let sessionLabel = 'guest';
let history = [];
let historyIndex = -1;
const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230b1220" rx="16"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%236b7280" font-size="22">CLI Upload</text></svg>';

const authFetch = async (input, init = {}) => {
  const res = await fetch(input, { ...init, credentials: 'same-origin' });
  return res;
};

const cliJsonRequest = async (input, init = {}, { actionLabel = '' } = {}) => {
  const run = async (confirmToken) => {
    const headers = { ...(init.headers || {}) };
    let bodyObj = null;
    if (init.body && typeof init.body === 'string') {
      bodyObj = JSON.parse(init.body);
    } else if (init.body && typeof init.body === 'object') {
      bodyObj = init.body;
    } else if (headers['Content-Type'] === 'application/json') {
      bodyObj = {};
    }
    if (confirmToken) {
      if (!bodyObj || typeof bodyObj !== 'object') bodyObj = {};
      bodyObj.confirmToken = confirmToken;
    }
    const body = bodyObj ? JSON.stringify(bodyObj) : init.body;
    const res = await authFetch(input, { ...init, headers, body });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  let { res, data } = await run();
  if (res.status === 409 && data && data.code === 'CONFIRM_REQUIRED') {
    const detailText = data.detail ? `\n${data.detail}` : '';
    const ok = window.confirm(`该操作需要二次确认：${data.action || actionLabel || ''}${detailText}\n\n确认继续？`);
    if (!ok) {
      throw new Error('已取消');
    }
    ({ res, data } = await run(data.confirmToken));
  }
  if (!res.ok) {
    throw new Error(data?.error || '请求失败');
  }
  return data;
};

const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const updatePrompt = (label) => {
  sessionLabel = label || sessionLabel || 'guest';
  if (promptEl) {
    promptEl.textContent = `[${sessionLabel}]$`;
  }
};
updatePrompt('guest');

const formatValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return Array.isArray(val) ? `[${val.length} items]` : '[object]';
  return String(val);
};

const formatDisplay = (data) => {
  if (data === null || data === undefined) return '';
  if (Array.isArray(data)) {
    if (!data.length) return '(empty)';
    const lines = [];
    data.forEach((item, idx) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const pairs = Object.entries(item)
          .map(([k, v]) => `${k}: ${formatValue(v)}`)
          .join(' | ');
        lines.push(`${idx + 1}. ${pairs}`);
      } else {
        lines.push(formatValue(item));
      }
      if (lines.length >= 50) {
        lines.push('...更多未显示');
        return;
      }
    });
    return lines.join('\n');
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join('\n');
  }
  return String(data);
};

const log = (message, type = 'info') => {
  const text = typeof message === 'string' ? message : formatDisplay(message);
  const line = document.createElement('div');
  line.className = `cli-line ${type}`;
  line.textContent = text;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
};

const formatJson = (obj) => formatDisplay(obj);

const parseArgs = (text) => {
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(text))) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
};

const seatKey = (row, col) => `r${row}-c${col}`;
const parseSeatToken = (token) => {
  if (!token) return null;
  const match = token.match(/r?(\d+)[^0-9]?c?(\d+)/i) || token.match(/(\d+)[^\d]+(\d+)/);
  if (!match) return null;
  const row = Number(match[1]) - 1;
  const col = Number(match[2]) - 1;
  if (Number.isNaN(row) || Number.isNaN(col)) return null;
  return { row, col };
};

const expandSeatRange = (startToken, endToken) => {
  const start = parseSeatToken(startToken);
  const end = parseSeatToken(endToken);
  if (!start || !end) throw new Error('座位范围格式错误，示例：r1c1 或 1c1');
  const seats = [];
  const rowStart = Math.min(start.row, end.row);
  const rowEnd = Math.max(start.row, end.row);
  const colStart = Math.min(start.col, end.col);
  const colEnd = Math.max(start.col, end.col);
  for (let r = rowStart; r <= rowEnd; r += 1) {
    for (let c = colStart; c <= colEnd; c += 1) {
      seats.push(seatKey(r, c));
    }
  }
  return seats;
};

const expandTicketRange = (start, end) => {
  const s = String(start || '');
  const e = String(end || '');
  const sMatch = s.match(/(.*?)(\d+)([^0-9]*)$/);
  const eMatch = e.match(/(.*?)(\d+)([^0-9]*)$/);
  if (!sMatch || !eMatch) throw new Error('票号范围需包含数字后缀，示例：T0001-T0010');
  if (sMatch[1] !== eMatch[1] || sMatch[3] !== eMatch[3]) {
    throw new Error('票号范围前后缀需一致');
  }
  const startNum = Number(sMatch[2]);
  const endNum = Number(eMatch[2]);
  if (Number.isNaN(startNum) || Number.isNaN(endNum)) throw new Error('票号范围数字无效');
  const width = Math.max(sMatch[2].length, eMatch[2].length);
  const lo = Math.min(startNum, endNum);
  const hi = Math.max(startNum, endNum);
  const list = [];
  for (let n = lo; n <= hi; n += 1) {
    list.push(`${sMatch[1]}${String(n).padStart(width, '0')}${sMatch[3]}`);
  }
  return list;
};

const parseRowRange = (rowsStr) => {
  if (!rowsStr) return { start: null, end: null };
  const parts = rowsStr.split('-').map((p) => Number(p.trim()));
  if (parts.length === 1) {
    const n = parts[0];
    if (!Number.isInteger(n)) throw new Error('行区间格式错误，示例 rows=1-5');
    return { start: n, end: n };
  }
  const [a, b] = parts;
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('行区间格式错误，示例 rows=1-5');
  return { start: Math.min(a, b), end: Math.max(a, b) };
};

const ensureProject = () => {
  if (!activeProjectId) {
    throw new Error('请先 select 项目');
  }
  return activeProjectId;
};

const commands = {
  help: async () => {
    log(
      [
        '常用命令：',
        '  login <username> <password>         登录（支持 admin / sales）',
        '  logout                              退出登录',
        '  whoami                              查看当前会话',
        '  projects                            列出项目',
        '  select <projectId>                  选择项目',
        '  project                             查看当前项目摘要',
        '  project-add <name> <rows> <cols>    创建项目（admin）',
        '  seats-summary                       查看状态统计',
        '  seat-status <row> <col> <status> [price] （admin）修改座位状态',
        '  seat-bulk-status seats=r1c1,r1c2 status=<status> [price=] （admin）批量改状态',
        '  seat-range-status start=r1c1 end=r3c5 status=<status> [price=] （admin）矩形范围改状态',
        '  ticket-range-status start=T0001 end=T0010 status=<status> [price=] （admin）按票号区间改状态',
        '  seats-export <csv|png>             导出座位 CSV/PNG',
        '  seat-price-lock price=<n> status=<available|locked|disabled> [rows=1-5] 按价位批量锁座/开售',
        '  checkin-range start=T0001 end=T0010 action=check|clear 票号区间检票/清除（admin）',
        '  seat-map                      输出字符座位图',
        '  checkin <ticketCode>                检票当前项目',
        '  checkin-stats                       检票统计',
        '  checkin-logs [limit] [projectId]    查看检票日志（admin）',
        '  checkin-clear <ticketCode>          清除检票状态（admin）',
        '  checkin-batch codes=code1,code2     批量检票',
        '  merch-products                      查看文创商品',
        '  merch-modes                         查看结账模式',
        '  merch-add <name> <price> <stock> [desc=xx] [img=dataUrl]  上传商品（admin）',
        '  merch-update <id> [name=] [price=] [stock=] [desc=] [img=] [enabled=true|false]（admin）',
        '  merch-toggle <id> <on|off>          启用/禁用商品（admin）',
        '  merch-bulk-toggle ids=id1,id2 <on|off> 批量启用/停用商品（admin）',
        '  merch-bulk-price ids=id1,id2 price=<value> 批量设价（admin）',
        '  merch-bulk-stock ids=id1,id2 stock=<value> 批量设库存（admin）',
        '  merch-order items=p1:2,p2:1 [mode=id] [note=备注]  提交订单（sales/admin）',
        '  merch-order-balance total=<amount> count=<n> [note=] [item=] [method=] [handledBy=]  平账批量生成订单（admin）',
        '  merch-orders                        查看订单（admin）',
        '  merch-order-update <id> items=... [mode=id] [note=]（admin）',
        '  merch-order-del <id>                删除订单（admin）',
        '  checkout-mode-add name=<n> type=<standard|percentage|fullcut> [value=] [threshold=] [cut=] [stack=] 描述字段 description=xx（admin）',
        '  checkout-mode-toggle <id> <on|off>  启用/禁用结账模式（admin）',
        '  audit-logs [limit=] [action=]       查看审计日志（admin）',
        '  audit-export [limit=] [action=]     导出审计日志为 JSON（admin）',
        '  accounts                            列出账户（admin）',
        '  account-add <u> <p> <role>          创建账户（admin）',
        '  account-role <u> <role>             修改角色（admin）',
        '  account-pass <u> <pwd>              重置密码（admin）',
        '  account-del <u>                     删除账号（admin）',
      ].join('\n')
    );
  },
  'seat-map': async () => {
    const id = ensureProject();
    const res = await authFetch(`/api/projects/${id}`);
    const data = await res.json();
    const project = data.project;
    if (!project) throw new Error('项目不存在');
    const rows = project.rows || 0;
    const cols = project.cols || 0;
    const seats = project.seats || {};
    const legend = [
      '⬜ 可售',
      '🟦 锁定',
      '🟧 已售',
      '🟩 已检',
      '⬛ 未启用',
    ].join('  ');
    const lines = [];
    for (let r = 0; r < rows; r += 1) {
      const rowCells = [];
      for (let c = 0; c < cols; c += 1) {
        const seat = seats[seatKey(r, c)];
        if (!seat || seat.status === 'disabled') {
          rowCells.push('⬛');
        } else if (seat.status === 'locked') {
          rowCells.push('🟦');
        } else if (seat.status === 'sold' && seat.checkedInAt) {
          rowCells.push('🟩');
        } else if (seat.status === 'sold') {
          rowCells.push('🟧');
        } else {
          rowCells.push('⬜');
        }
      }
      lines.push(`${String(r + 1).padStart(2, '0')}: ${rowCells.join('')}`);
    }
    log(`座位图（${project.name} ${rows}x${cols}）\n${legend}\n${lines.join('\n')}`);
  },
  login: async (...args) => {
    const [username, password] = args;
    if (!username || !password) throw new Error('用法：login <username> <password>');
    const res = await authFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '登录失败');
    log(`已登录：${username}`, 'success');
    updatePrompt(`${data.role || 'user'}:${data.username || username}`);
  },
  logout: async () => {
    await authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    log('已退出登录', 'success');
    updatePrompt('guest');
  },
  whoami: async () => {
    const res = await authFetch('/api/auth/session');
    const data = await res.json();
    log(data);
    if (data?.authenticated) {
      updatePrompt(`${data.role || 'user'}:${data.username || 'user'}`);
    } else {
      updatePrompt('guest');
    }
  },
  projects: async () => {
    const res = await authFetch('/api/projects');
    const data = await res.json();
    cachedProjects = data.projects || [];
    log(cachedProjects);
  },
  select: async (projectId) => {
    if (!projectId) throw new Error('用法：select <projectId>');
    activeProjectId = projectId;
    log(`已选择项目：${projectId}`, 'success');
  },
  project: async () => {
    const id = ensureProject();
    const res = await authFetch(`/api/projects/${id}`);
    if (res.status === 404) throw new Error('项目不存在');
    const data = await res.json();
    const seats = Object.values(data.project?.seats || {});
    const summary = seats.reduce(
      (acc, seat) => {
        acc.total += 1;
        acc[seat.status] = (acc[seat.status] || 0) + 1;
        if (seat.checkedInAt) acc.checked += 1;
        return acc;
      },
      { total: 0, available: 0, locked: 0, sold: 0, disabled: 0, checked: 0 }
    );
    log({ project: data.project?.name, id, rows: data.project?.rows, cols: data.project?.cols, summary });
  },
  'project-add': async (name, rowsStr, colsStr) => {
    if (!name || !rowsStr || !colsStr) throw new Error('用法：project-add <name> <rows> <cols>');
    const rows = Number(rowsStr);
    const cols = Number(colsStr);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      throw new Error('行列需为正整数');
    }
    const res = await authFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rows, cols }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '创建失败');
    activeProjectId = data.project?.id || null;
    log(`项目已创建：${data.project?.name || ''}`, 'success');
  },
  'seats-summary': async () => {
    const id = ensureProject();
    const res = await authFetch(`/api/projects/${id}`);
    const data = await res.json();
    const seats = Object.values(data.project?.seats || {});
    const summary = seats.reduce(
      (acc, seat) => {
        acc[seat.status] = (acc[seat.status] || 0) + 1;
        if (seat.checkedInAt) acc.checked = (acc.checked || 0) + 1;
        return acc;
      },
      {}
    );
    log(summary);
  },
  'seat-status': async (rowStr, colStr, status, priceStr) => {
    const id = ensureProject();
    const row = Number(rowStr) - 1;
    const col = Number(colStr) - 1;
    if (Number.isNaN(row) || Number.isNaN(col) || !status) {
      throw new Error('用法：seat status <row> <col> <status> [price]');
    }
    const seatId = seatKey(row, col);
    const payload = { status };
    if (priceStr !== undefined) {
      const price = Number(priceStr);
      if (!Number.isNaN(price)) payload.price = price;
    }
    const res = await authFetch(`/api/projects/${id}/seats/${seatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '修改失败');
    log(`座位 ${seatId} 已更新为 ${status}`, 'success');
  },
  'seat-range-status': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const { start, end, status } = kv;
    const price = kv.price !== undefined ? Number(kv.price) : undefined;
    if (!start || !end || !status) throw new Error('用法：seat-range-status start=r1c1 end=r3c5 status=<status> [price=]');
    const seatIds = expandSeatRange(start, end);
    for (const seatId of seatIds) {
      try {
        const payload = { status };
        if (price !== undefined && !Number.isNaN(price)) payload.price = price;
        const res = await authFetch(`/api/projects/${ensureProject()}/seats/${seatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '修改失败');
        log(`座位 ${seatId} -> ${status}`, 'success');
      } catch (err) {
        log(`座位 ${seatId} 失败：${err.message}`, 'error');
      }
    }
  },
  'ticket-range-status': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const { start, end, status } = kv;
    const price = kv.price !== undefined ? Number(kv.price) : undefined;
    if (!start || !end || !status) throw new Error('用法：ticket-range-status start=T0001 end=T0010 status=<status> [price=]');
    const tickets = expandTicketRange(start, end);
    const projectRes = await authFetch(`/api/projects/${ensureProject()}`);
    const projectData = await projectRes.json();
    const seats = projectData.project?.seats || {};
    const seatMap = {};
    Object.values(seats).forEach((seat) => {
      if (seat?.ticketNumber) seatMap[seat.ticketNumber] = seatKey(seat.row, seat.col);
    });
    for (const ticket of tickets) {
      const seatId = seatMap[ticket];
      if (!seatId) {
        log(`未找到票号 ${ticket} 的座位`, 'error');
        continue;
      }
      try {
        const payload = { status };
        if (price !== undefined && !Number.isNaN(price)) payload.price = price;
        const res = await authFetch(`/api/projects/${ensureProject()}/seats/${seatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '修改失败');
        log(`票号 ${ticket} -> 座位 ${seatId} 状态 ${status}`, 'success');
      } catch (err) {
        log(`票号 ${ticket} 失败：${err.message}`, 'error');
      }
    }
  },
  'seats-export': async (type) => {
    const id = ensureProject();
    const fmt = (type || 'csv').toLowerCase();
    if (!['csv', 'png'].includes(fmt)) throw new Error('用法：seats-export <csv|png>');
    const res = await authFetch(`/api/projects/${id}/export/${fmt}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '导出失败');
    }
    const blob = await res.blob();
    downloadBlob(`project-${id}-seats.${fmt}`, blob);
    log(`已导出座位 ${fmt.toUpperCase()}`, 'success');
  },
  'seat-price-lock': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const price = kv.price !== undefined ? Number(kv.price) : NaN;
    const status = kv.status;
    const rowsRange = parseRowRange(kv.rows);
    if (!Number.isFinite(price)) throw new Error('用法：seat-price-lock price=<数字> status=<available|locked|disabled> [rows=1-5]');
    if (!['available', 'locked', 'disabled'].includes(status)) throw new Error('状态仅支持 available|locked|disabled');
    const projectRes = await authFetch(`/api/projects/${ensureProject()}`);
    const data = await projectRes.json();
    const seats = Object.values(data.project?.seats || {});
    const targets = seats.filter((seat) => {
      if (seat.price == null || Number(seat.price) !== price) return false;
      const row = seat.row + 1;
      if (rowsRange.start && row < rowsRange.start) return false;
      if (rowsRange.end && row > rowsRange.end) return false;
      return true;
    });
    if (!targets.length) {
      log('未找到符合条件的座位');
      return;
    }
    for (const seat of targets) {
      const seatId = seatKey(seat.row, seat.col);
      try {
        const res = await authFetch(`/api/projects/${data.project.id}/seats/${seatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const respData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(respData.error || '更新失败');
        log(`座位 ${seatId} -> ${status}`, 'success');
      } catch (err) {
        log(`座位 ${seatId} 失败：${err.message}`, 'error');
      }
    }
  },
  'seat-bulk-status': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const seatsRaw = kv.seats || kv.ids;
    const status = kv.status;
    const price = kv.price !== undefined ? Number(kv.price) : undefined;
    if (!seatsRaw || !status) throw new Error('用法：seat-bulk-status seats=r1c1,r1c2 status=<status> [price=]');
    const id = ensureProject();
    const tokens = seatsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const normalizeSeatId = (token) => {
      const m = token.match(/r?(\d+)[^0-9]?c?(\d+)/i) || token.match(/(\d+)[^\d]+(\d+)/);
      if (!m) return null;
      const row = Number(m[1]) - 1;
      const col = Number(m[2]) - 1;
      if (Number.isNaN(row) || Number.isNaN(col)) return null;
      return seatKey(row, col);
    };
    for (const token of tokens) {
      const seatId = normalizeSeatId(token);
      if (!seatId) {
        log(`座位标识无效：${token}`, 'error');
        continue;
      }
      const payload = { status };
      if (price !== undefined && !Number.isNaN(price)) payload.price = price;
      try {
        const res = await authFetch(`/api/projects/${id}/seats/${seatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '更新失败');
        log(`座位 ${seatId} 已更新为 ${status}`, 'success');
      } catch (err) {
        log(`座位 ${seatId} 失败：${err.message}`, 'error');
      }
    }
  },
  checkin: async (ticketCode) => {
    const id = ensureProject();
    if (!ticketCode) throw new Error('用法：checkin <ticketCode>');
    const res = await authFetch(`/api/projects/${id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode, scannerId: 'cli' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '检票失败');
    log({ message: '检票成功', seat: data.seat }, 'success');
  },
  'checkin-stats': async () => {
    const id = ensureProject();
    const res = await authFetch(`/api/projects/${id}/checkin/stats`);
    const data = await res.json();
    log(data.stats || {});
  },
  'checkin-logs': async (limitStr, projectId) => {
    const lim = limitStr ? Number(limitStr) : 50;
    const query = new URLSearchParams();
    if (lim) query.set('limit', String(lim));
    if (projectId || activeProjectId) query.set('projectId', projectId || activeProjectId);
    const res = await authFetch(`/api/checkins?${query.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '获取失败');
    log(data.logs || []);
  },
  'checkin-batch': async (codesLine) => {
    if (!codesLine) throw new Error('用法：checkin-batch codes=code1,code2');
    const kv = Object.fromEntries(
      codesLine
        .split(',')
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const codes = kv.codes ? kv.codes.split(',').map((c) => c.trim()).filter(Boolean) : [];
    if (!codes.length) throw new Error('用法：checkin-batch codes=code1,code2');
    for (const code of codes) {
      try {
        await commands.checkin(code);
      } catch (err) {
        log(`检票失败 ${code}: ${err.message}`, 'error');
      }
    }
  },
  'checkin-pending': async (action) => {
    const pending = JSON.parse(localStorage.getItem('cliCheckinPending') || '[]');
    if (!action || action === 'list') {
      if (!pending.length) {
        log('暂无待重试记录');
        return;
      }
      log(pending);
      return;
    }
    if (action === 'clear') {
      localStorage.removeItem('cliCheckinPending');
      log('已清空待重试列表');
      return;
    }
    if (action === 'retry') {
      if (!pending.length) {
        log('暂无待重试记录');
        return;
      }
      const id = ensureProject();
      const ticketCodes = pending.map((p) => p.ticketCode);
      try {
        const res = await authFetch(`/api/projects/${id}/checkin/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketCodes, scannerId: 'cli' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '批量重试失败');
        const results = data.results || [];
        const failed = results.filter((r) => !r.ok).map((r) => ({ ticketCode: r.ticketCode, reason: r.error }));
        if (failed.length) {
          localStorage.setItem('cliCheckinPending', JSON.stringify(failed));
          log(`重试完成，失败 ${failed.length} 条`, 'error');
        } else {
          localStorage.removeItem('cliCheckinPending');
          log('重试完成，全部成功', 'success');
        }
      } catch (err) {
        log(err.message || '重试失败', 'error');
      }
    }
  },
  'checkin-range': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const { start, end, action } = kv;
    if (!start || !end || !action) throw new Error('用法：checkin-range start=T0001 end=T0010 action=check|clear');
    const tickets = expandTicketRange(start, end);
    for (const code of tickets) {
      try {
        if (action === 'clear') {
          await commands['checkin-clear'](code);
        } else {
          await commands.checkin(code);
        }
      } catch (err) {
        log(`票号 ${code} 处理失败：${err.message}`, 'error');
      }
    }
  },
  'checkin-clear': async (ticketCode) => {
    if (!ticketCode) throw new Error('用法：checkin-clear <ticketCode>');
    const data = await cliJsonRequest(
      '/api/checkins/seat',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNumber: ticketCode, action: 'clear' }),
      },
      { actionLabel: '清除检票状态' }
    );
    log(`已清除 ${ticketCode} 检票状态`, 'success');
    if (data.undo?.backupFilename) {
      log(`可撤销：在管理端恢复备份 ${data.undo.backupFilename}`, 'info');
    }
  },
  'merch-products': async () => {
    const res = await authFetch('/api/merch/products');
    const data = await res.json();
    log(data.products || []);
  },
  'merch-modes': async () => {
    const res = await authFetch('/api/merch/modes');
    const data = await res.json();
    log(data.modes || []);
  },
  'checkout-mode-add': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const payload = {
      name: kv.name,
      type: kv.type || 'standard',
      value: kv.value ? Number(kv.value) : undefined,
      threshold: kv.threshold ? Number(kv.threshold) : undefined,
      cutAmount: kv.cut ? Number(kv.cut) : undefined,
      stackLimit: kv.stack ? Number(kv.stack) : undefined,
      description: kv.description || '',
      enabled: true,
    };
    if (!payload.name) throw new Error('用法：checkout-mode-add name=<n> type=<...> [value=] ...');
    const res = await authFetch('/api/merch/modes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '创建失败');
    log('结账模式已创建', 'success');
  },
  'checkout-mode-toggle': async (id, onoff) => {
    if (!id || !onoff) throw new Error('用法：checkout-mode-toggle <id> <on|off>');
    const enabled = onoff.toLowerCase() === 'on';
    const res = await authFetch(`/api/merch/modes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '更新失败');
    log(`结账模式 ${id} 已${enabled ? '启用' : '停用'}`, 'success');
  },
  'merch-orders': async () => {
    const res = await authFetch('/api/merch/orders');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '获取失败');
    log(data.orders || []);
  },
  'merch-orders-csv': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const params = new URLSearchParams();
    if (kv.since) params.set('since', Date.parse(kv.since));
    if (kv.until) params.set('until', Date.parse(kv.until) + 24 * 3600 * 1000);
    if (kv.handler) params.set('handler', kv.handler);
    if (kv.mode) params.set('mode', kv.mode);
    if (kv.kw) params.set('keyword', kv.kw);
    const res = await authFetch(`/api/merch/orders/export/csv?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '导出失败');
    }
    const blob = await res.blob();
    downloadBlob(`merch-orders-${new Date().toISOString().slice(0, 10)}.csv`, blob);
    log('CSV 导出完成', 'success');
  },
  'audit-logs': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const params = new URLSearchParams();
    const limit = kv.limit ? Number(kv.limit) : 50;
    const page = kv.page ? Number(kv.page) : 1;
    const offset = limit * Math.max(0, (page || 1) - 1);
    params.set('limit', limit);
    params.set('offset', offset);
    if (kv.action) params.set('action', kv.action);
    const res = await authFetch(`/api/audit?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '获取审计日志失败');
    log(data.logs || []);
  },
  'audit-export': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const params = new URLSearchParams();
    if (kv.limit) params.set('limit', kv.limit);
    if (kv.action) params.set('action', kv.action);
    const res = await authFetch(`/api/audit/export?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '导出失败');
    }
    const blob = await res.blob();
    downloadBlob(`audit-log-${new Date().toISOString().slice(0, 10)}.json`, blob);
    log('审计日志导出完成', 'success');
  },
  'merch-add': async (name, priceStr, stockStr, ...rest) => {
    if (!name || priceStr === undefined || stockStr === undefined) {
      throw new Error('用法：merch-add <name> <price> <stock> [desc=] [img=dataUrl]');
    }
    const price = Number(priceStr);
    const stock = Number(stockStr);
    if (!Number.isFinite(price) || price < 0) throw new Error('价格需为非负数字');
    if (!Number.isFinite(stock) || stock < 0) throw new Error('库存需为非负数字');
    const kv = Object.fromEntries(
      rest
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const payload = {
      name,
      price,
      stock,
      description: kv.desc || kv.description || '',
      imageData: kv.img || kv.image || PLACEHOLDER_IMG,
      enabled: true,
    };
    const res = await authFetch('/api/merch/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '上传失败');
    log(`商品已创建：${data.product?.name || ''}`, 'success');
  },
  'merch-update': async (id, ...args) => {
    if (!id) throw new Error('用法：merch-update <id> [name=] [price=] [stock=] [desc=] [img=] [enabled=true|false]');
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const payload = {};
    if (kv.name) payload.name = kv.name;
    if (kv.price !== undefined) payload.price = Number(kv.price);
    if (kv.stock !== undefined) payload.stock = Number(kv.stock);
    if (kv.desc !== undefined || kv.description !== undefined) payload.description = kv.desc || kv.description;
    if (kv.img !== undefined || kv.image !== undefined) payload.imageData = kv.img || kv.image;
    if (kv.enabled !== undefined) payload.enabled = kv.enabled === 'true' || kv.enabled === 'on';
    const res = await authFetch(`/api/merch/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '更新失败');
    log(`商品 ${id} 已更新`, 'success');
  },
  'merch-toggle': async (id, onoff) => {
    if (!id || !onoff) throw new Error('用法：merch-toggle <id> <on|off>');
    const enabled = onoff.toLowerCase() === 'on';
    const res = await authFetch(`/api/merch/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '更新失败');
    log(`商品 ${id} 已${enabled ? '启用' : '停用'}`, 'success');
  },
  'merch-bulk-toggle': async (idsLine, onoff) => {
    if (!idsLine || !onoff) throw new Error('用法：merch-bulk-toggle ids=id1,id2 <on|off>');
    const enabled = onoff.toLowerCase() === 'on';
    const kv = Object.fromEntries(
      idsLine
        .split(',')
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const ids = kv.ids ? kv.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (!ids.length) throw new Error('用法：merch-bulk-toggle ids=id1,id2 <on|off>');
    for (const id of ids) {
      try {
        await commands['merch-toggle'](id, onoff);
      } catch (err) {
        log(`商品 ${id} 处理失败: ${err.message}`, 'error');
      }
    }
  },
  'merch-bulk-price': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const ids = kv.ids ? kv.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const price = kv.price !== undefined ? Number(kv.price) : NaN;
    if (!ids.length || Number.isNaN(price)) {
      throw new Error('用法：merch-bulk-price ids=id1,id2 price=<value>');
    }
    for (const id of ids) {
      try {
        await commands['merch-update'](id, `price=${price}`);
      } catch (err) {
        log(`商品 ${id} 设价失败: ${err.message}`, 'error');
      }
    }
  },
  'merch-bulk-stock': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const ids = kv.ids ? kv.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const stock = kv.stock !== undefined ? Number(kv.stock) : NaN;
    if (!ids.length || Number.isNaN(stock)) {
      throw new Error('用法：merch-bulk-stock ids=id1,id2 stock=<value>');
    }
    for (const id of ids) {
      try {
        await commands['merch-update'](id, `stock=${stock}`);
      } catch (err) {
        log(`商品 ${id} 设置库存失败: ${err.message}`, 'error');
      }
    }
  },
  'merch-orders': async () => {
    const res = await authFetch('/api/merch/orders');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '获取失败');
    log(formatJson(data.orders || []));
  },
  'merch-order-update': async (id, ...args) => {
    if (!id) throw new Error('用法：merch-order-update <id> items=prod:qty,... [mode=] [note=]');
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const itemsRaw = kv.items;
    const payload = {};
    if (itemsRaw) {
      payload.items = itemsRaw.split(',').map((entry) => {
        const [pid, qtyStr] = entry.split(':');
        return { productId: pid, quantity: Number(qtyStr || 1) };
      });
    }
    if (kv.mode !== undefined) payload.checkoutModeId = kv.mode || null;
    if (kv.note !== undefined) payload.note = kv.note;
    const res = await authFetch(`/api/merch/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '更新失败');
    log(`订单 ${id} 已更新`, 'success');
  },
  'merch-order-del': async (id) => {
    if (!id) throw new Error('用法：merch-order-del <id>');
    const data = await cliJsonRequest(
      `/api/merch/orders/${id}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      { actionLabel: '删除文创订单' }
    );
    log(`订单 ${id} 已删除`, 'success');
    if (data.undo?.backupFilename) {
      log(`可撤销：在管理端恢复备份 ${data.undo.backupFilename}`, 'info');
    }
  },
  'merch-order': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    const itemsRaw = kv.items;
    if (!itemsRaw) throw new Error('用法：merch-order items=prod1:2,prod2:1 [mode=id] [note=备注]');
    const items = itemsRaw.split(',').map((entry) => {
      const [id, qtyStr] = entry.split(':');
      return { productId: id, quantity: Number(qtyStr || 1) };
    });
    const payload = {
      items,
      checkoutModeId: kv.mode || null,
      note: kv.note || '',
    };
    const res = await authFetch('/api/merch/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '下单失败');
    log('订单已记录', 'success');
  },
  'merch-order-balance': async (...args) => {
    const kv = Object.fromEntries(
      args
        .map((arg) => arg.split('=').map((s) => s.trim()))
        .filter((pair) => pair.length === 2 && pair[0])
    );
    if (!kv.total || !kv.count) {
      throw new Error('用法：merch-order-balance total=<amount> count=<n> [note=] [item=] [method=] [handledBy=]');
    }
    const payload = {
      total: Number(kv.total),
      count: Number(kv.count),
      note: kv.note || '',
      itemName: kv.item || '',
      paymentMethod: kv.method || kv.pay || '',
      handledBy: kv.handledBy || kv.handler || '',
    };
    const res = await authFetch('/api/merch/orders/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '平账失败');
    log(`已生成 ${data.orders?.length || 0} 笔平账订单`, 'success');
  },
  accounts: async () => {
    const res = await authFetch('/api/accounts');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '获取失败');
    log(data.accounts || []);
  },
  'account-add': async (username, password, role) => {
    if (!username || !password || !role) throw new Error('用法：account-add <u> <p> <role>');
    const res = await authFetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '创建失败');
    log(`账号 ${username} 创建成功`, 'success');
  },
  'account-role': async (username, role) => {
    if (!username || !role) throw new Error('用法：account-role <u> <role>');
    const res = await authFetch(`/api/accounts/${encodeURIComponent(username)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '修改失败');
    log(`账号 ${username} 角色已改为 ${role}`, 'success');
  },
  'account-pass': async (username, password) => {
    if (!username || !password) throw new Error('用法：account-pass <u> <newPassword>');
    const res = await authFetch(`/api/accounts/${encodeURIComponent(username)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '修改失败');
    log(`账号 ${username} 密码已重置`, 'success');
  },
  'account-del': async (username) => {
    if (!username) throw new Error('用法：account-del <u>');
    const data = await cliJsonRequest(
      `/api/accounts/${encodeURIComponent(username)}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      { actionLabel: '删除账号' }
    );
    log(`账号 ${username} 已删除`, 'success');
    if (data.undo?.backupFilename) {
      log(`可撤销：在管理端恢复备份 ${data.undo.backupFilename}`, 'info');
    }
  },
};

const execute = async (line) => {
  if (!line.trim()) return;
  const segments = line
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    log(`$ ${seg}`, 'info');
    const tokens = parseArgs(seg);
    const name = tokens[0];
    const args = tokens.slice(1);
    const handler = commands[name];
    if (!handler) {
      log('未知命令，输入 help 查看', 'error');
      continue;
    }
    try {
      await handler(...args);
    } catch (error) {
      log(error.message || '执行失败', 'error');
    }
  }
};

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    execute(inputEl.value);
    if (inputEl.value.trim()) {
      history.unshift(inputEl.value);
      history = history.slice(0, 100);
    }
    historyIndex = -1;
    inputEl.value = '';
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (history.length === 0) return;
    historyIndex = Math.min(historyIndex + 1, history.length - 1);
    inputEl.value = history[historyIndex];
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex <= 0) {
      historyIndex = -1;
      inputEl.value = '';
    } else {
      historyIndex -= 1;
      inputEl.value = history[historyIndex];
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const partial = inputEl.value.trim();
    if (!partial) return;
    const names = Object.keys(commands);
    const matches = names.filter((n) => n.startsWith(partial));
    if (matches.length === 1) {
      inputEl.value = matches[0] + ' ';
    } else if (matches.length > 1) {
      log(matches.join('  '));
    }
  }
});

quickButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    inputEl.value = btn.dataset.command;
    execute(btn.dataset.command);
    inputEl.focus();
  });
});

log('欢迎使用 CLI 模式。输入 help 查看命令。查询类命令可直接使用，写操作请先 login。', 'info');
inputEl.focus();
