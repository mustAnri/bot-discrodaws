// ===== Bot Barokah Admin Panel =====
(() => {
    "use strict";

    const SETTINGS_FIELDS = ["handlerRoleId", "takeLogChannelId", "doneLogChannelId", "rankingChannelId"];

    const el = {
        loginView: document.getElementById("login-view"),
        dashboardView: document.getElementById("dashboard-view"),
        loginForm: document.getElementById("login-form"),
        password: document.getElementById("password"),
        loginBtn: document.getElementById("login-btn"),
        loginError: document.getElementById("login-error"),
        logoutBtn: document.getElementById("logout-btn"),
        connStatus: document.getElementById("conn-status"),
        tabs: document.querySelectorAll(".tab"),
        settingsForm: document.getElementById("settings-form"),
        settingsReload: document.getElementById("settings-reload"),
        settingsStatus: document.getElementById("settings-status"),
        handlersList: document.getElementById("handlers-list"),
        handlersReload: document.getElementById("handlers-reload"),
        backupBtn: document.getElementById("backup-btn"),
        restoreFile: document.getElementById("restore-file"),
        syncBtn: document.getElementById("sync-btn"),
        toolsStatus: document.getElementById("tools-status"),
        editModal: document.getElementById("edit-modal"),
        editForm: document.getElementById("edit-form"),
        editUserId: document.getElementById("edit-user-id"),
        editMaxJob: document.getElementById("edit-maxJob"),
        editTotalDone: document.getElementById("edit-totalDone"),
        editServices: document.getElementById("edit-services"),
        editCancel: document.getElementById("edit-cancel"),
        editError: document.getElementById("edit-error"),
        toast: document.getElementById("toast"),
        sysReload: document.getElementById("sys-reload"),
        clearMemBtn: document.getElementById("clear-mem-btn"),
        speedBtn: document.getElementById("speed-btn"),
        clearLogsBtn: document.getElementById("clear-logs-btn"),
        logConsole: document.getElementById("log-console"),
        acAccounts: document.getElementById("ac-accounts"),
        acAddForm: document.getElementById("ac-add-form"),
        acName: document.getElementById("ac-name"),
        acToken: document.getElementById("ac-token"),
        acChannel: document.getElementById("ac-channel"),
        acAddStatus: document.getElementById("ac-add-status"),
        acStartAll: document.getElementById("ac-start-all"),
        acStopAll: document.getElementById("ac-stop-all"),
        acConfigForm: document.getElementById("ac-config-form"),
        acConfigReload: document.getElementById("ac-config-reload"),
        acConfigStatus: document.getElementById("ac-config-status"),
        acHumanize: document.getElementById("ac-humanize"),
        acActivityName: document.getElementById("ac-activity_name"),
        acEditModal: document.getElementById("ac-edit-modal"),
        acEditForm: document.getElementById("ac-edit-form"),
        acEditName: document.getElementById("ac-edit-name"),
        acEditToken: document.getElementById("ac-edit-token"),
        acEditChannel: document.getElementById("ac-edit-channel"),
        acEditCancel: document.getElementById("ac-edit-cancel"),
        acEditError: document.getElementById("ac-edit-error"),
        acLogConsole: document.getElementById("ac-log-console"),
        acClearLogsBtn: document.getElementById("ac-clear-logs-btn"),
        appVersion: document.getElementById("app-version"),
        // AUTOPOST
        apReload: document.getElementById("ap-reload"),
        apUsersTable: document.getElementById("ap-users-table"),
        apStatus: document.getElementById("ap-status"),
        apConfigSection: document.getElementById("ap-config-section"),
        apConfigUsername: document.getElementById("ap-config-username"),
        apConfigBack: document.getElementById("ap-config-back"),
        apTokenForm: document.getElementById("ap-token-form"),
        apTokenInput: document.getElementById("ap-token-input"),
        apTokenStatus: document.getElementById("ap-token-status"),
        apChannelsTable: document.getElementById("ap-channels-table"),
        apNewChannelId: document.getElementById("ap-new-channelId"),
        apNewMessage: document.getElementById("ap-new-message"),
        apNewHours: document.getElementById("ap-new-hours"),
        apNewMinutes: document.getElementById("ap-new-minutes"),
        apNewSeconds: document.getElementById("ap-new-seconds"),
        apAddChannel: document.getElementById("ap-add-channel"),
        apChannelsStatus: document.getElementById("ap-channels-status"),
        apRoomInfo: document.getElementById("ap-room-info"),
        apRoomStatus: document.getElementById("ap-room-status"),
        apStartUser: document.getElementById("ap-start-user"),
        apStopUser: document.getElementById("ap-stop-user"),
        apControlStatus: document.getElementById("ap-control-status"),
        apLogConsole: document.getElementById("ap-log-console"),
        apClearLogsBtn: document.getElementById("ap-clear-logs-btn"),
        apSettingsForm: document.getElementById("ap-settings-form"),
        apBannerUrl: document.getElementById("ap-banner-url"),
        apWhitelistRole: document.getElementById("ap-whitelist-role"),
        apSetupRole: document.getElementById("ap-setup-role"),
        apSettingsReload: document.getElementById("ap-settings-reload"),
        apSettingsStatus: document.getElementById("ap-settings-status")
    };

    let editingUserId = null;
    let toastTimer = null;
    let sysPollTimer = null;
    let logPollTimer = null;
    let lastLogTs = null;
    let activeTab = "settings";
    let acPollTimer = null;
    let acEditingName = null;
    let acLogPollTimer = null;
    let lastAcLogTs = null;
    // AUTOPOST
    let apPollTimer = null;
    let apSelectedUserId = null;
    let apLogPollTimer = null;
    let lastApLogTs = null;

    // ================= UTIL =================
    async function api(path, options = {}) {
        const res = await fetch(path, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const error = new Error(body.error || `Request gagal (${res.status})`);
            error.status = res.status;
            throw error;
        }
        return body;
    }

    function showToast(message, type = "ok") {
        el.toast.textContent = message;
        el.toast.className = `toast ${type}`;
        el.toast.classList.remove("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 3000);
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    // ================= AUTH =================
    async function checkAuth() {
        try {
            const { data } = await api("/api/auth/me");
            showView(data.loggedIn ? "dashboard" : "login");
            if (data.loggedIn) initDashboard();
        } catch {
            showView("login");
        }
    }

    function showView(view) {
        el.loginView.classList.toggle("hidden", view !== "login");
        el.dashboardView.classList.toggle("hidden", view !== "dashboard");
    }

    el.loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        el.loginError.textContent = "";
        el.loginBtn.disabled = true;

        try {
            await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ password: el.password.value })
            });
            el.password.value = "";
            showView("dashboard");
            initDashboard();
        } catch (err) {
            el.loginError.textContent = err.message;
        } finally {
            el.loginBtn.disabled = false;
        }
    });

    el.logoutBtn.addEventListener("click", async () => {
        try { await api("/api/logout", { method: "POST" }); } catch { /* abaikan */ }
        showView("login");
    });

    // ================= TABS =================
    el.tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            el.tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.dataset.tab;
            document.getElementById("tab-settings").classList.toggle("hidden", target !== "settings");
            document.getElementById("tab-handlers").classList.toggle("hidden", target !== "handlers");
            document.getElementById("tab-system").classList.toggle("hidden", target !== "system");
            document.getElementById("tab-autoclick").classList.toggle("hidden", target !== "autoclick");
            document.getElementById("tab-autopost").classList.toggle("hidden", target !== "autopost");
            onTabSwitch(target);
        });
    });

    // ================= SETTINGS =================
    async function loadSettings() {
        try {
            const { data } = await api("/api/config");
            for (const field of SETTINGS_FIELDS) {
                document.getElementById(field).value = data[field] || "";
            }
            el.connStatus.textContent = "ONLINE";
        } catch (err) {
            if (err.status === 401) return showView("login");
            el.settingsStatus.textContent = `Gagal memuat: ${err.message}`;
            el.settingsStatus.className = "status-msg err";
        }
    }

    el.settingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        el.settingsStatus.textContent = "";

        const payload = {};
        for (const field of SETTINGS_FIELDS) {
            payload[field] = document.getElementById(field).value.trim();
        }

        try {
            await api("/api/config", { method: "PUT", body: JSON.stringify(payload) });
            el.settingsStatus.textContent = "✅ Pengaturan berhasil disimpan.";
            el.settingsStatus.className = "status-msg ok";
            showToast("Pengaturan tersimpan");
        } catch (err) {
            if (err.status === 401) return showView("login");
            el.settingsStatus.textContent = `❌ ${err.message}`;
            el.settingsStatus.className = "status-msg err";
        }
    });

    el.settingsReload.addEventListener("click", loadSettings);

    // ================= HANDLERS =================
    async function loadHandlers() {
        try {
            const { data } = await api("/api/handlers");
            renderHandlers(data);
        } catch (err) {
            if (err.status === 401) return showView("login");
            el.handlersList.innerHTML = `<div class="empty-state">❌ ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderHandlers(handlers) {
        const entries = Object.entries(handlers)
            .sort((a, b) => (b[1].totalDone || 0) - (a[1].totalDone || 0));

        if (entries.length === 0) {
            el.handlersList.innerHTML = `<div class="empty-state">— BELUM ADA HANDLER TERDAFTAR —</div>`;
            return;
        }

        el.handlersList.innerHTML = entries.map(([userId, h], index) => {
            const jobs = h.jobs || [];
            const maxJob = h.maxJob ?? 0;
            const activeJobs = jobs.length;

            // Status slot: ready / partial / full
            let statusClass = "s-ready";
            let slotLabel = "READY";
            if (maxJob > 0 && activeJobs >= maxJob) {
                statusClass = "s-full";
                slotLabel = "FULL";
            } else if (activeJobs > 0) {
                statusClass = "s-partial";
                slotLabel = "BUSY";
            }

            const services = (h.services || []).map(s => `<span class="chip">${escapeHtml(s)}</span>`).join("");
            const jobChips = jobs.map(j =>
                `<span class="chip jobs" title="${escapeHtml(j.order || "")} / ${escapeHtml(j.world || "")}">▸ ${escapeHtml(j.order || "job")}</span>`
            ).join("");

            return `
            <div class="handler-card ${statusClass}" style="animation-delay:${index * 0.05}s">
                <div class="handler-info">
                    <div class="handler-user">
                        &lt;@${escapeHtml(userId)}&gt;
                        <span class="slot ${statusClass}">${slotLabel}</span>
                    </div>
                    <div class="handler-stats">
                        <div class="stat">
                            <span class="stat-label">SLOTS</span>
                            <span class="stat-value">${activeJobs}/${maxJob}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">TOTAL DONE</span>
                            <span class="stat-value accent">${h.totalDone ?? 0}</span>
                        </div>
                    </div>
                    <div class="handler-services">${services}${jobChips}</div>
                </div>
                <div class="handler-actions">
                    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeHtml(userId)}">EDIT</button>
                    <button class="btn btn-ghost btn-sm" data-action="reset" data-id="${escapeHtml(userId)}">RESET JOB</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(userId)}">HAPUS</button>
                </div>
            </div>`;
        }).join("");
    }

    el.handlersList.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const { action, id } = btn.dataset;

        if (action === "edit") {
            openEditModal(id);
            return;
        }

        if (action === "reset") {
            if (!confirm(`Reset semua job aktif handler ${id}?`)) return;
            try {
                await api(`/api/handlers/${id}/reset`, { method: "POST" });
                showToast("Job handler direset");
                loadHandlers();
            } catch (err) {
                showToast(err.message, "err");
            }
            return;
        }

        if (action === "delete") {
            if (!confirm(`Hapus handler ${id} sepenuhnya? Data totalDone ikut terhapus.`)) return;
            try {
                await api(`/api/handlers/${id}`, { method: "DELETE" });
                showToast("Handler dihapus");
                loadHandlers();
            } catch (err) {
                showToast(err.message, "err");
            }
        }
    });

    el.handlersReload.addEventListener("click", loadHandlers);

    // ================= BACKUP / RESTORE / SYNC =================
    function setToolsStatus(message, type = "") {
        el.toolsStatus.textContent = message;
        el.toolsStatus.className = `status-msg ${type}`;
    }

    // Download backup sebagai file JSON
    el.backupBtn.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/backup");
            if (res.status === 401) return showView("login");
            if (!res.ok) throw new Error("Gagal membuat backup.");

            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setToolsStatus("✅ Backup berhasil didownload.", "ok");
        } catch (err) {
            setToolsStatus(`❌ ${err.message}`, "err");
        }
    });

    // Restore dari file backup
    el.restoreFile.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = ""; // reset agar bisa pilih file sama lagi
        if (!file) return;

        if (!confirm("Restore akan MENGGANTI seluruh data saat ini dengan isi backup. Lanjutkan?")) return;

        try {
            const text = await file.text();
            const payload = JSON.parse(text);

            const { data } = await api("/api/restore", { method: "POST", body: JSON.stringify(payload) });
            setToolsStatus(`✅ Restore berhasil: ${data.imported} handler diimpor.`, "ok");
            loadHandlers();
        } catch (err) {
            const msg = err instanceof SyntaxError ? "File bukan JSON yang valid." : err.message;
            setToolsStatus(`❌ ${msg}`, "err");
        }
    });

    // Sync dari channel ranking Discord
    el.syncBtn.addEventListener("click", async () => {
        if (!confirm("Sync akan menimpa totalDone mengikuti data leaderboard di channel ranking. Lanjutkan?")) return;

        el.syncBtn.disabled = true;
        setToolsStatus("⏳ Mengambil data dari channel ranking...");

        try {
            const { data } = await api("/api/sync-ranking", { method: "POST" });
            setToolsStatus(`✅ Sync berhasil: ${data.updated} handler diupdate dari channel ranking.`, "ok");
            loadHandlers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            setToolsStatus(`❌ ${err.message}`, "err");
        } finally {
            el.syncBtn.disabled = false;
        }
    });

    // ================= EDIT MODAL =================
    function openEditModal(userId) {
        api("/api/handlers")
            .then(({ data }) => {
                const h = data[userId];
                if (!h) throw new Error("Handler tidak ditemukan.");
                editingUserId = userId;
                el.editUserId.textContent = userId;
                el.editMaxJob.value = h.maxJob ?? 0;
                el.editTotalDone.value = h.totalDone ?? 0;
                el.editServices.value = (h.services || []).join(", ");
                el.editError.textContent = "";
                el.editModal.classList.remove("hidden");
            })
            .catch(err => showToast(err.message, "err"));
    }

    function closeEditModal() {
        editingUserId = null;
        el.editModal.classList.add("hidden");
    }

    el.editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!editingUserId) return;

        const payload = {
            maxJob: Number(el.editMaxJob.value),
            totalDone: Number(el.editTotalDone.value),
            services: el.editServices.value.split(",").map(s => s.trim()).filter(Boolean)
        };

        try {
            await api(`/api/handlers/${editingUserId}`, { method: "PUT", body: JSON.stringify(payload) });
            closeEditModal();
            showToast("Handler diupdate");
            loadHandlers();
        } catch (err) {
            el.editError.textContent = err.message;
        }
    });

    el.editCancel.addEventListener("click", closeEditModal);
    el.editModal.addEventListener("click", (e) => {
        if (e.target === el.editModal) closeEditModal();
    });

    // ================= SYSTEM MONITORING =================
    const SYSTEM_POLL_MS = 5000;
    const LOG_POLL_MS = 2500;
    const MAX_LOG_LINES = 400;

    function formatUptime(totalSec) {
        const d = Math.floor(totalSec / 86400);
        const h = Math.floor((totalSec % 86400) / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const parts = [];
        if (d > 0) parts.push(`${d}h`);
        if (h > 0 || d > 0) parts.push(`${h}j`);
        parts.push(`${m}m`);
        return parts.join(" ");
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    async function loadSystemInfo() {
        try {
            const { data } = await api("/api/system");
            const p = data.process;
            const h = data.host;

            setText("sys-status", data.bot.ready ? "ONLINE" : "OFFLINE");
            setText("sys-uptime", formatUptime(p.uptimeSec));
            setText("sys-heap", `${p.heapUsedMB} MB`);
            setText("sys-ram", `${h.freeMemGB}/${h.totalMemGB} GB`);
            setText("sys-cpu", `${h.cpuLoad1m} (${h.cpus} core)`);
            setText("sys-ping", data.network.discordPingMs === null
                ? "GAGAL"
                : `${data.network.discordPingMs} ms`);

            const memPct = h.totalMemBytes > 0
                ? Math.min(100, ((p.rssMB * 1e6) / h.totalMemBytes) * 100)
                : 0;
            document.getElementById("mem-bar-fill").style.width = `${memPct.toFixed(1)}%`;
            setText("mem-legend", `rss ${p.rssMB} MB · heap ${p.heapUsedMB}/${p.heapTotalMB} MB`);

            setText("net-spec",
                `HOSTNAME : ${h.hostname}\n` +
                `OS       : ${h.platform} (${h.arch})\n` +
                `NODE     : ${h.node}\n` +
                `CPU      : ${h.cpuModel} × ${h.cpus}\n` +
                `RAM      : ${h.totalMemGB} GB total · ${h.freeMemGB} GB free\n` +
                `PID      : ${p.pid} · guild aktif: ${data.bot.guildCount ?? "—"}`
            );
        } catch (err) {
            if (err.status === 401) return showView("login");
            setText("sys-status", "ERROR");
        }
    }

    // ---- Logs ----
    function appendLogLines(lines, target = el.logConsole) {
        if (lines.length === 0) return;
        const frag = document.createDocumentFragment();
        for (const line of lines) {
            const div = document.createElement("div");
            div.className = `log-line ${line.level}`;

            const time = document.createElement("span");
            time.className = "log-time";
            time.textContent = line.ts.slice(11, 19);

            const level = document.createElement("span");
            level.className = `log-level ${line.level}`;
            level.textContent = line.level;

            const msg = document.createElement("span");
            msg.className = "log-msg";
            msg.textContent = line.msg;

            div.append(time, level, msg);
            frag.appendChild(div);
        }

        const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 60;
        target.appendChild(frag);

        while (target.children.length > MAX_LOG_LINES) {
            target.removeChild(target.firstChild);
        }
        if (isAtBottom) target.scrollTop = target.scrollHeight;
    }

    async function pollLogs(full = false) {
        try {
            const query = (!full && lastLogTs) ? `?after=${encodeURIComponent(lastLogTs)}` : "";
            const { data } = await api(`/api/logs${query}`);
            if (data.length > 0) {
                appendLogLines(data);
                lastLogTs = data[data.length - 1].ts;
            }
        } catch (err) {
            if (err.status === 401) showView("login");
        }
    }

    // ---- Clear memory ----
    el.clearMemBtn.addEventListener("click", async () => {
        el.clearMemBtn.disabled = true;
        try {
            const { data } = await api("/api/system/clear-memory", { method: "POST" });
            const parts = [`heap ${data.heapBeforeMB}→${data.heapAfterMB} MB`, `pesan cache dibuang: ${data.sweptMessages}`];
            if (data.gcHint) parts.push(data.gcHint);
            showToast(`🧹 ${parts.join(" · ")}`);
            loadSystemInfo();
        } catch (err) {
            showToast(err.message, "err");
        } finally {
            el.clearMemBtn.disabled = false;
        }
    });

    // ---- Speed test (async: start → polling status) ----
    let speedPollTimer = null;

    async function pollSpeedStatus() {
        try {
            const { data } = await api("/api/system/speed/status");
            if (data.busy) {
                setText("net-status", "⏳ Speed test berjalan...");
                document.getElementById("net-status").className = "status-msg";
                return;
            }

            clearInterval(speedPollTimer);
            speedPollTimer = null;
            el.speedBtn.disabled = false;

            if (data.error) {
                setText("net-status", `❌ ${data.error}`);
                document.getElementById("net-status").className = "status-msg err";
                return;
            }
            if (data.result) {
                setText("net-down", `${data.result.downMbps} Mbps`);
                setText("net-latency", data.result.latencyMs === null ? "—" : `${data.result.latencyMs} ms`);
                setText("net-elapsed", `${(data.result.elapsedMs / 1000).toFixed(1)} s`);
                setText("net-status", "✅ Speed test selesai.");
                document.getElementById("net-status").className = "status-msg ok";
            }
        } catch (err) {
            clearInterval(speedPollTimer);
            el.speedBtn.disabled = false;
        }
    }

    el.speedBtn.addEventListener("click", async () => {
        el.speedBtn.disabled = true;
        setText("net-status", "🚀 Memulai speed test...");
        document.getElementById("net-status").className = "status-msg";
        setText("net-down", "…");

        try {
            await api("/api/system/speed", { method: "POST" });
            speedPollTimer = setInterval(pollSpeedStatus, 2000);
        } catch (err) {
            el.speedBtn.disabled = false;
            setText("net-status", `❌ ${err.message}`);
            document.getElementById("net-status").className = "status-msg err";
        }
    });

    // ---- Clear logs ----
    el.clearLogsBtn.addEventListener("click", async () => {
        try {
            await api("/api/logs/clear", { method: "POST" });
            el.logConsole.innerHTML = "";
            lastLogTs = null;
            showToast("Log dibersihkan");
        } catch (err) {
            showToast(err.message, "err");
        }
    });

    el.sysReload.addEventListener("click", loadSystemInfo);

    // ---- Polling lifecycle: hanya jalan saat tab SYSTEM aktif ----
    function onTabSwitch(tab) {
        activeTab = tab;
        if (tab === "system") {
            loadSystemInfo();
            pollLogs(true);
            sysPollTimer = setInterval(loadSystemInfo, SYSTEM_POLL_MS);
            logPollTimer = setInterval(() => pollLogs(false), LOG_POLL_MS);
        } else {
            clearInterval(sysPollTimer);
            clearInterval(logPollTimer);
            sysPollTimer = null;
            logPollTimer = null;
        }

        // ---- Polling lifecycle: AUTO VERIF ----
        if (tab === "autoclick") {
            loadAutoClickStatus();
            loadAcConfig();
            pollAcLogs(true);
            acPollTimer = setInterval(loadAutoClickStatus, AC_POLL_MS);
            acLogPollTimer = setInterval(() => pollAcLogs(false), AC_LOG_POLL_MS);
        } else {
            clearInterval(acPollTimer);
            acPollTimer = null;
            clearInterval(acLogPollTimer);
            acLogPollTimer = null;
        }

        // ---- Polling lifecycle: AUTOPOST ----
        if (tab === "autopost") {
            loadApUsers();
            loadApSettings();
            pollApLogs(true);
            apPollTimer = setInterval(loadApUsers, AP_POLL_MS);
            apLogPollTimer = setInterval(() => pollApLogs(false), AP_LOG_POLL_MS);
        } else {
            clearInterval(apPollTimer);
            apPollTimer = null;
            clearInterval(apLogPollTimer);
            apLogPollTimer = null;
        }
    }

    // ================= AUTO VERIF (AUTO-CLICK) =================
    const AC_POLL_MS = 3000;
    const AC_CONFIG_FIELDS = [
        "base_delay", "min_delay", "max_delay",
        "human_delay_min", "human_delay_max",
        "max_click_retries", "heartbeat_timeout", "confirm_watchdog_timeout"
    ];

    // ================= AUTOPOST =================
    const AP_POLL_MS = 5000;
    const AP_LOG_POLL_MS = 3000;

    // Badge berdasarkan string status worker dari backend
    const AC_STATUS_BADGES = {
        "🟢 Running":           { rail: "w-running",  cls: "s-ready",   label: "RUNNING" },
        "🟡 Starting":          { rail: "w-starting", cls: "s-partial", label: "STARTING" },
        "🔄 Authenticating...": { rail: "w-running",  cls: "s-partial", label: "AUTHENTICATING" },
        "✅ Logged In":         { rail: "w-running",  cls: "s-ready",   label: "LOGGED IN" },
        "❌ Token Invalid":     { rail: "w-error",    cls: "s-full",    label: "TOKEN INVALID" },
        "🔴 Stopped":           { rail: "w-stopped",  cls: "s-stop",    label: "STOPPED" }
    };

    function acStatusBadge(status) {
        return AC_STATUS_BADGES[status] || { rail: "w-stopped", cls: "s-stop", label: status || "UNKNOWN" };
    }

    function setAcAddStatus(message, type = "") {
        el.acAddStatus.textContent = message;
        el.acAddStatus.className = `status-msg ${type}`;
    }

    function setAcConfigStatus(message, type = "") {
        el.acConfigStatus.textContent = message;
        el.acConfigStatus.className = `status-msg ${type}`;
    }

    // Format uptime singkat: 2j 5m / 12m 3d / 45d
    function formatAcUptime(totalSec) {
        if (!totalSec || totalSec <= 0) return "—";
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const d = Math.floor(totalSec % 60);
        if (h > 0) return `${h}j ${m}m`;
        if (m > 0) return `${m}m ${d}d`;
        return `${d}d`;
    }

    function renderAcAccounts(accounts) {
        if (!accounts || accounts.length === 0) {
            el.acAccounts.innerHTML = `<div class="empty-state">— BELUM ADA AKUN AUTO VERIF —</div>`;
            return;
        }

        el.acAccounts.innerHTML = accounts.map((acc, index) => {
            const meta = acStatusBadge(acc.status);
            const stats = acc.stats || {};

            const statBlocks = `
                <div class="stat">
                    <span class="stat-label">UPTIME</span>
                    <span class="stat-value">${formatAcUptime(stats.uptimeSec)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">MESSAGES</span>
                    <span class="stat-value">${stats.messageCount ?? 0}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">CLICKS</span>
                    <span class="stat-value accent">${stats.clickCount ?? 0}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">ERRORS</span>
                    <span class="stat-value">${stats.errorCount ?? 0}</span>
                </div>`;

            const logLines = (acc.logs || []).map(line =>
                `<div class="ac-log-line">${escapeHtml(line)}</div>`
            ).join("");

            const startStopBtn = acc.running
                ? `<button class="btn btn-ghost btn-sm" data-action="ac-stop" data-id="${escapeHtml(acc.name)}">⏹ STOP</button>`
                : `<button class="btn btn-primary btn-sm" data-action="ac-start" data-id="${escapeHtml(acc.name)}">▶ START</button>`;

            return `
            <div class="ac-card ${meta.rail}" style="animation-delay:${index * 0.05}s">
                <div class="ac-info">
                    <div class="ac-title">
                        ${escapeHtml(acc.name)}
                        <span class="slot ${meta.cls}">${escapeHtml(meta.label)}</span>
                    </div>
                    <div class="ac-meta">
                        <span>TOKEN ${escapeHtml(acc.tokenMasked || "********")}</span>
                        <span>CHANNEL ${escapeHtml(acc.channelId || "-")}</span>
                    </div>
                    <div class="handler-stats">${statBlocks}</div>
                    ${logLines ? `<div class="ac-logs">${logLines}</div>` : ""}
                </div>
                <div class="handler-actions">
                    ${startStopBtn}
                    <button class="btn btn-ghost btn-sm" data-action="ac-edit" data-id="${escapeHtml(acc.name)}">EDIT</button>
                    <button class="btn btn-danger btn-sm" data-action="ac-delete" data-id="${escapeHtml(acc.name)}">HAPUS</button>
                </div>
            </div>`;
        }).join("");
    }

    async function loadAutoClickStatus() {
        try {
            const { data } = await api("/api/autoclick/status");
            renderAcAccounts(data.accounts || []);
        } catch (err) {
            if (err.status === 401) return showView("login");
            el.acAccounts.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
        }
    }

    // ---- Tambah akun ----
    el.acAddForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            name: el.acName.value.trim(),
            token: el.acToken.value.trim(),
            channelId: el.acChannel.value.trim()
        };
        try {
            await api("/api/autoclick/accounts", { method: "POST", body: JSON.stringify(payload) });
            el.acName.value = "";
            el.acToken.value = "";
            el.acChannel.value = "";
            setAcAddStatus("✅ Akun ditambahkan.", "ok");
            loadAutoClickStatus();
        } catch (err) {
            setAcAddStatus(err.message, "err");
        }
    });

    // ---- Start All / Stop All ----
    el.acStartAll.addEventListener("click", async () => {
        if (!confirm("Start semua akun auto verif?")) return;
        try {
            const { data } = await api("/api/autoclick/start-all", { method: "POST" });
            showToast(`▶ ${data.started} worker dimulai`);
            loadAutoClickStatus();
        } catch (err) {
            showToast(err.message, "err");
        }
    });

    el.acStopAll.addEventListener("click", async () => {
        if (!confirm("Stop semua akun auto verif?")) return;
        try {
            const { data } = await api("/api/autoclick/stop-all", { method: "POST" });
            showToast(`⏹ ${data.stopped} worker dihentikan`);
            loadAutoClickStatus();
        } catch (err) {
            showToast(err.message, "err");
        }
    });

    // ---- Aksi per akun (start / stop / edit / delete) ----
    el.acAccounts.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const { action, id } = btn.dataset;
        const encodedId = encodeURIComponent(id);

        if (action === "ac-start") {
            try {
                await api(`/api/autoclick/accounts/${encodedId}/start`, { method: "POST" });
                showToast(`▶ Worker "${id}" dimulai`);
                setTimeout(loadAutoClickStatus, 800);
            } catch (err) {
                showToast(err.message, "err");
            }
            return;
        }

        if (action === "ac-stop") {
            try {
                await api(`/api/autoclick/accounts/${encodedId}/stop`, { method: "POST" });
                showToast(`⏹ Worker "${id}" dihentikan`);
                loadAutoClickStatus();
            } catch (err) {
                showToast(err.message, "err");
            }
            return;
        }

        if (action === "ac-edit") {
            openAcEditModal(id);
            return;
        }

        if (action === "ac-delete") {
            if (!confirm(`Hapus akun "${id}" sepenuhnya? Token ikut terhapus.`)) return;
            try {
                await api(`/api/autoclick/accounts/${encodedId}`, { method: "DELETE" });
                showToast(`Akun "${id}" dihapus`);
                loadAutoClickStatus();
            } catch (err) {
                showToast(err.message, "err");
            }
        }
    });

    // ---- Edit modal (ganti token / channel) ----
    async function openAcEditModal(name) {
        try {
            const { data } = await api("/api/autoclick/status");
            const acc = (data.accounts || []).find(a => a.name === name);
            if (!acc) throw new Error(`Akun "${name}" tidak ditemukan.`);

            acEditingName = name;
            el.acEditName.textContent = name;
            el.acEditToken.value = "";
            el.acEditChannel.value = acc.channelId || "";
            el.acEditError.textContent = "";
            el.acEditModal.classList.remove("hidden");
        } catch (err) {
            showToast(err.message, "err");
        }
    }

    function closeAcEditModal() {
        acEditingName = null;
        el.acEditModal.classList.add("hidden");
    }

    el.acEditForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!acEditingName) return;

        const payload = { channelId: el.acEditChannel.value.trim() };
        const newToken = el.acEditToken.value.trim();
        if (newToken) payload.token = newToken;

        try {
            await api(`/api/autoclick/accounts/${encodeURIComponent(acEditingName)}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            closeAcEditModal();
            showToast("Akun diperbarui");
            loadAutoClickStatus();
        } catch (err) {
            el.acEditError.textContent = err.message;
        }
    });

    el.acEditCancel.addEventListener("click", closeAcEditModal);
    el.acEditModal.addEventListener("click", (e) => {
        if (e.target === el.acEditModal) closeAcEditModal();
    });

    // ---- Pengaturan klik (delay & humanisasi) ----
    async function loadAcConfig() {
        try {
            const { data } = await api("/api/autoclick/config");
            for (const field of AC_CONFIG_FIELDS) {
                const input = document.getElementById(`ac-${field}`);
                if (input && data[field] !== undefined && data[field] !== null) {
                    input.value = data[field];
                }
            }
            el.acHumanize.checked = !!data.humanize;
            el.acActivityName.value = data.activity_name || "";
        } catch (err) {
            if (err.status === 401) return showView("login");
            setAcConfigStatus(`Gagal memuat: ${err.message}`, "err");
        }
    }

    el.acConfigForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            humanize: el.acHumanize.checked,
            activity_name: el.acActivityName.value.trim()
        };
        for (const field of AC_CONFIG_FIELDS) {
            const input = document.getElementById(`ac-${field}`);
            if (input && input.value.trim() !== "") {
                payload[field] = Number(input.value);
            }
        }
        try {
            await api("/api/autoclick/config", { method: "PUT", body: JSON.stringify(payload) });
            setAcConfigStatus("✅ Pengaturan disimpan & diterapkan ke worker running.", "ok");
        } catch (err) {
            setAcConfigStatus(err.message, "err");
        }
    });

    el.acConfigReload.addEventListener("click", loadAcConfig);

    // ---- Log khusus auto verif (live) ----
    const AC_LOG_POLL_MS = 2500;

    async function pollAcLogs(full = false) {
        try {
            const query = (!full && lastAcLogTs) ? `?after=${encodeURIComponent(lastAcLogTs)}` : "";
            const { data } = await api(`/api/autoclick/logs${query}`);
            if (data.length > 0) {
                appendLogLines(data, el.acLogConsole);
                lastAcLogTs = data[data.length - 1].ts;
            }
        } catch (err) {
            if (err.status === 401) showView("login");
        }
    }

    el.acClearLogsBtn.addEventListener("click", async () => {
        try {
            await api("/api/autoclick/logs/clear", { method: "POST" });
            el.acLogConsole.innerHTML = "";
            lastAcLogTs = null;
            showToast("Log auto verif dibersihkan");
        } catch (err) {
            showToast(err.message, "err");
        }
    });

    // ---- Versi app + commit git (badge topbar) ----
    async function loadVersion() {
        try {
            const { data } = await api("/api/version");
            let label = `v${data.version}`;
            if (data.git && data.git.commit) label += ` · ${data.git.commit}`;
            if (el.appVersion) {
                el.appVersion.textContent = label;
                const title = [];
                if (data.git && data.git.branch) title.push(`branch: ${data.git.branch}`);
                if (data.git && data.git.committedAt) title.push(`commit: ${data.git.committedAt}`);
                el.appVersion.title = title.join("\n");
            }
        } catch (err) {
            // Tidak kritis — biarkan badge default.
        }
    }

    // ================= AUTOPOST =================
    // ---- SEC.10: AUTOPOST STATUS ----
    async function loadApUsers() {
        try {
            const { data } = await api("/api/autopost/users");
            renderApUsersTable(data);
            el.apStatus.textContent = `✅ Terakhir dimuat: ${new Date().toLocaleTimeString()}`;
            el.apStatus.className = "status-msg ok";
        } catch (err) {
            if (err.status === 401) return showView("login");
            el.apStatus.textContent = `❌ Gagal memuat: ${err.message}`;
            el.apStatus.className = "status-msg err";
        }
    }

    function renderApUsersTable(users) {
        if (!users || users.length === 0) {
            el.apUsersTable.innerHTML = `<p class="panel-desc">Belum ada pengguna autopost.</p>`;
            return;
        }

        const rows = users.map(u => {
            const statusBadge = u.running
                ? `<span class="badge s-ready">🟢 Running</span>`
                : `<span class="badge s-down">🔴 Stopped</span>`;
            const tokenBadge = u.tokenSet
                ? `<span class="badge s-ready">Set (${escapeHtml(u.tokenPreview)})</span>`
                : `<span class="badge s-down">Not Set</span>`;
            const roomLink = u.room && u.room.channelId
                ? `<a href="https://discord.com/channels/${u.room.guildId || "@me"}/${u.room.channelId}" target="_blank" rel="noopener">${escapeHtml(u.room.channelId)}</a>`
                : "—";

            return `
                <tr>
                    <td>
                        <div><strong>${escapeHtml(u.username)}</strong></div>
                        <small>${escapeHtml(u.userId)}</small>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${tokenBadge}</td>
                    <td>${u.channelCount || 0}</td>
                    <td>${roomLink}</td>
                    <td>
                        <div class="form-actions" style="gap: 4px;">
                            <button class="btn btn-ghost btn-sm" data-action="ap-view" data-user-id="${escapeHtml(u.userId)}" data-username="${escapeHtml(u.username)}">View</button>
                            <button class="btn btn-primary btn-sm" data-action="ap-start" data-user-id="${escapeHtml(u.userId)}" ${u.running ? "disabled" : ""}>Start</button>
                            <button class="btn btn-danger btn-sm" data-action="ap-stop" data-user-id="${escapeHtml(u.userId)}" ${!u.running ? "disabled" : ""}>Stop</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        el.apUsersTable.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Status</th>
                        <th>Token</th>
                        <th>Channels</th>
                        <th>Room</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    // Event delegation for ap-users-table actions
    el.apUsersTable.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const userId = btn.dataset.userId;
        const username = btn.dataset.username;

        if (action === "ap-view") {
            openApConfig(userId, username);
        } else if (action === "ap-start") {
            await apControlUser(userId, "start");
        } else if (action === "ap-stop") {
            await apControlUser(userId, "stop");
        }
    });

    async function apControlUser(userId, action) {
        try {
            const endpoint = action === "start" ? `/api/autopost/users/${userId}/start` : `/api/autopost/users/${userId}/stop`;
            await api(endpoint, { method: "POST" });
            showToast(`✅ Worker ${action === "start" ? "dimulai" : "dihentikan"}`);
            if (activeTab === "autopost") loadApUsers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            showToast(err.message, "err");
        }
    }

    el.apReload.addEventListener("click", loadApUsers);

    // ---- SEC.11: AUTOPOST CONFIG (per-user editor) ----
    function openApConfig(userId, username) {
        apSelectedUserId = userId;
        el.apConfigUsername.textContent = `${escapeHtml(username)} (${escapeHtml(userId)})`;
        el.apConfigSection.hidden = false;
        // Clear previous statuses
        el.apTokenStatus.textContent = "";
        el.apChannelsStatus.textContent = "";
        el.apRoomStatus.textContent = "";
        el.apControlStatus.textContent = "";
        // Load user config
        loadApUserConfig(userId);
    }

    function closeApConfig() {
        apSelectedUserId = null;
        el.apConfigSection.hidden = true;
    }

    el.apConfigBack.addEventListener("click", closeApConfig);

    async function loadApUserConfig(userId) {
        try {
            const { data } = await api(`/api/autopost/users/${userId}`);
            // Token preview
            if (data.tokenPreview) {
                el.apTokenInput.placeholder = `Token tersembunyi (${escapeHtml(data.tokenPreview)})`;
            } else {
                el.apTokenInput.placeholder = "Token tersembunyi";
            }
            // Channels
            renderApChannelsTable(data.channels || []);
            // Room
            renderApRoomInfo(data.room);
            // Start/Stop buttons state
            el.apStartUser.disabled = data.running;
            el.apStopUser.disabled = !data.running;
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(`Gagal memuat: ${err.message}`, "err");
        }
    }

    function setApConfigStatus(msg, type = "ok", element = el.apChannelsStatus) {
        element.textContent = msg;
        element.className = `status-msg ${type}`;
    }

    // Token form
    el.apTokenForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!apSelectedUserId) return;
        const token = el.apTokenInput.value.trim();
        if (!token) {
            setApConfigStatus("Token tidak boleh kosong", "err", el.apTokenStatus);
            return;
        }
        try {
            await api(`/api/autopost/users/${apSelectedUserId}/token`, {
                method: "PUT",
                body: JSON.stringify({ token })
            });
            el.apTokenInput.value = "";
            setApConfigStatus("✅ Token disimpan", "ok", el.apTokenStatus);
            loadApUserConfig(apSelectedUserId);
            if (activeTab === "autopost") loadApUsers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err", el.apTokenStatus);
        }
    });

    // Channels table
    function renderApChannelsTable(channels) {
        if (!channels || channels.length === 0) {
            el.apChannelsTable.innerHTML = `<p class="panel-desc">Belum ada channel. Tambahkan di bawah.</p>`;
            return;
        }

        const rows = channels.map((ch, idx) => {
            const interval = formatInterval(ch.interval);
            const msg = escapeHtml(ch.message || "");
            const truncated = msg.length > 60 ? msg.slice(0, 60) + "…" : msg;
            return `
                <tr>
                    <td>${escapeHtml(ch.id)}</td>
                    <td>${truncated}</td>
                    <td>${interval}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" data-action="ap-remove-channel" data-channel-id="${escapeHtml(ch.id)}">Hapus</button>
                    </td>
                </tr>
            `;
        }).join("");

        el.apChannelsTable.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Channel ID</th>
                        <th>Message (truncated)</th>
                        <th>Interval</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    function formatInterval(totalSec) {
        if (!totalSec) return "0s";
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const parts = [];
        if (h > 0) parts.push(`${h}j`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}d`);
        return parts.join(" ");
    }

    // Add channel
    el.apAddChannel.addEventListener("click", async () => {
        if (!apSelectedUserId) return;
        const channelId = el.apNewChannelId.value.trim();
        const message = el.apNewMessage.value.trim();
        const hours = parseInt(el.apNewHours.value) || 0;
        const minutes = parseInt(el.apNewMinutes.value) || 0;
        const seconds = parseInt(el.apNewSeconds.value) || 0;

        if (!channelId || !message) {
            setApConfigStatus("Channel ID dan Pesan wajib diisi", "err");
            return;
        }
        const totalMs = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
        if (totalMs < 1000) {
            setApConfigStatus("Interval minimal 1 detik", "err");
            return;
        }

        try {
            await api(`/api/autopost/users/${apSelectedUserId}/channels`, {
                method: "POST",
                body: JSON.stringify({ channelId, message, hours, minutes, seconds })
            });
            el.apNewChannelId.value = "";
            el.apNewMessage.value = "";
            el.apNewHours.value = 0;
            el.apNewMinutes.value = 5;
            el.apNewSeconds.value = 0;
            setApConfigStatus("✅ Channel ditambahkan", "ok");
            loadApUserConfig(apSelectedUserId);
            if (activeTab === "autopost") loadApUsers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err");
        }
    });

    // Remove channel (event delegation)
    el.apChannelsTable.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action='ap-remove-channel']");
        if (!btn || !apSelectedUserId) return;
        const channelId = btn.dataset.channelId;
        if (!confirm(`Hapus channel ${channelId}?`)) return;
        try {
            await api(`/api/autopost/users/${apSelectedUserId}/channels/${channelId}`, { method: "DELETE" });
            setApConfigStatus("✅ Channel dihapus", "ok");
            loadApUserConfig(apSelectedUserId);
            if (activeTab === "autopost") loadApUsers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err");
        }
    });

    // Room info
    function renderApRoomInfo(room) {
        if (!room || !room.channelId) {
            el.apRoomInfo.innerHTML = `<p class="panel-desc">Belum ada room voice channel yang dikonfigurasi.</p>`;
            return;
        }
        // room.guildId = ID guild tempat room dibuat, room.channelId = channel private room
        const guildId = room.guildId || "@me";
        const channelId = room.channelId;
        el.apRoomInfo.innerHTML = `
            <div class="field">
                <label>Room Voice Channel</label>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <a href="https://discord.com/channels/${guildId}/${channelId}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
                        Buka di Discord
                    </a>
                    <button class="btn btn-danger btn-sm" data-action="ap-close-room">Tutup Room</button>
                </div>
                <small>Guild: ${escapeHtml(guildId)} • Channel: ${escapeHtml(channelId)}</small>
            </div>
        `;
    }

    el.apRoomInfo.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action='ap-close-room']");
        if (!btn || !apSelectedUserId) return;
        if (!confirm("Tutup room voice channel untuk pengguna ini?")) return;
        try {
            await api(`/api/autopost/users/${apSelectedUserId}/room`, { method: "DELETE" });
            setApConfigStatus("✅ Room ditutup", "ok", el.apRoomStatus);
            loadApUserConfig(apSelectedUserId);
            if (activeTab === "autopost") loadApUsers();
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err", el.apRoomStatus);
        }
    });

    // Start/Stop user
    el.apStartUser.addEventListener("click", async () => {
        if (!apSelectedUserId) return;
        await apControlUser(apSelectedUserId, "start");
        el.apStartUser.disabled = true;
        el.apStopUser.disabled = false;
        setApConfigStatus("✅ Worker dimulai", "ok", el.apControlStatus);
    });

    el.apStopUser.addEventListener("click", async () => {
        if (!apSelectedUserId) return;
        await apControlUser(apSelectedUserId, "stop");
        el.apStartUser.disabled = false;
        el.apStopUser.disabled = true;
        setApConfigStatus("✅ Worker dihentikan", "ok", el.apControlStatus);
    });

    // ---- SEC.12: AUTOPOST LOGS ----
    async function pollApLogs(full = false) {
        try {
            const query = (!full && lastApLogTs) ? `?after=${encodeURIComponent(lastApLogTs)}` : "";
            const { data } = await api(`/api/autopost/logs${query}`);
            if (data.length > 0) {
                appendLogLines(data, el.apLogConsole);
                lastApLogTs = data[data.length - 1].ts;
            }
        } catch (err) {
            if (err.status === 401) showView("login");
        }
    }

    el.apClearLogsBtn.addEventListener("click", async () => {
        try {
            await api("/api/autopost/logs/clear", { method: "POST" });
            el.apLogConsole.innerHTML = "";
            lastApLogTs = null;
            showToast("Log autopost dibersihkan");
        } catch (err) {
            showToast(err.message, "err");
        }
    });

    // ---- SEC.13: PANEL SETTINGS (banner + whitelist role + setup role) ----
    async function loadApSettings() {
        try {
            const { data } = await api("/api/autopost/settings");
            el.apBannerUrl.value = data.bannerUrl || "";
            el.apWhitelistRole.value = data.whitelistRoleId || "";
            el.apSetupRole.value = data.setupRoleId || "";
            setApConfigStatus("", "ok", el.apSettingsStatus);
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err", el.apSettingsStatus);
        }
    }

    el.apSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await api("/api/autopost/settings", {
                method: "PUT",
                body: JSON.stringify({
                    bannerUrl: el.apBannerUrl.value.trim(),
                    whitelistRoleId: el.apWhitelistRole.value.trim(),
                    setupRoleId: el.apSetupRole.value.trim()
                })
            });
            setApConfigStatus("✅ Settings panel disimpan", "ok", el.apSettingsStatus);
            showToast("Settings panel autopost disimpan");
        } catch (err) {
            if (err.status === 401) return showView("login");
            setApConfigStatus(err.message, "err", el.apSettingsStatus);
        }
    });

    el.apSettingsReload.addEventListener("click", loadApSettings);

    // ================= INIT =================
    function initDashboard() {
        loadVersion();
        loadSettings();
        loadHandlers();
    }

    checkAuth();
})();
