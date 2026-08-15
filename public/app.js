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
        editModal: document.getElementById("edit-modal"),
        editForm: document.getElementById("edit-form"),
        editUserId: document.getElementById("edit-user-id"),
        editMaxJob: document.getElementById("edit-maxJob"),
        editTotalDone: document.getElementById("edit-totalDone"),
        editServices: document.getElementById("edit-services"),
        editCancel: document.getElementById("edit-cancel"),
        editError: document.getElementById("edit-error"),
        toast: document.getElementById("toast")
    };

    let editingUserId = null;
    let toastTimer = null;

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
        });
    });

    // ================= SETTINGS =================
    async function loadSettings() {
        try {
            const { data } = await api("/api/config");
            for (const field of SETTINGS_FIELDS) {
                document.getElementById(field).value = data[field] || "";
            }
            el.connStatus.textContent = "● Terhubung";
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
            el.handlersList.innerHTML = `<div class="empty-state">Belum ada handler terdaftar.</div>`;
            return;
        }

        el.handlersList.innerHTML = entries.map(([userId, h]) => {
            const jobs = h.jobs || [];
            const services = (h.services || []).map(s => `<span class="chip">${escapeHtml(s)}</span>`).join("");
            const jobChips = jobs.map(j =>
                `<span class="chip jobs" title="${escapeHtml(j.order || "")} / ${escapeHtml(j.world || "")}">📋 ${escapeHtml(j.order || "job")}</span>`
            ).join("");

            return `
            <div class="handler-card">
                <div class="handler-info">
                    <div class="handler-user">&lt;@${escapeHtml(userId)}&gt;</div>
                    <div class="handler-stats">
                        <span>Max Job: <b>${h.maxJob ?? 0}</b></span>
                        <span>Job Aktif: <b>${jobs.length}</b></span>
                        <span>Total Done: <b>${h.totalDone ?? 0}</b></span>
                    </div>
                    <div class="handler-services">${services}${jobChips}</div>
                </div>
                <div class="handler-actions">
                    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeHtml(userId)}">✏️ Edit</button>
                    <button class="btn btn-ghost btn-sm" data-action="reset" data-id="${escapeHtml(userId)}">♻️ Reset Job</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(userId)}">🗑️ Hapus</button>
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

    // ================= INIT =================
    function initDashboard() {
        loadSettings();
        loadHandlers();
    }

    checkAuth();
})();
