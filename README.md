# Discord Handler Bot

Discord bot untuk manajemen handler job (join, take job, done, status, ranking) menggunakan [discord.js](https://discord.js.org/) v14, dilengkapi **admin panel web** untuk mengatur role/channel ID dan kelola data handler tanpa edit kode.

## 🚀 One-Click Deploy ke Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new?template=https%3A%2F%2Fgithub.com%2FmustAnri%2Fbot-discrodaws)

Klik tombol di atas, lalu isi **Variables** di Railway:

| Variable | Keterangan |
|----------|------------|
| `TOKEN` | Token bot Discord |
| `CLIENT_ID` | Application ID |
| `GUILD_ID` | ID server Discord |
| `DATA_DIR` | `/data` |
| `ADMIN_PASSWORD` | Password admin panel (buat yang kuat!) |

Setelah deploy selesai:
1. Klik kanan service → **Add Volume** → mount path `/data` (agar data tidak hilang saat redeploy)
2. **Settings → Networking → Generate Domain** (untuk akses admin panel)
3. Buka domain tersebut → login pakai `ADMIN_PASSWORD`
4. Deploy slash commands (sekali saja): `railway run node deploy-commands.js` atau jalankan lokal dengan `npm run deploy-commands`

## ✨ Fitur Admin Panel

- ⚙️ Ubah Handler Role ID, Take/Done Log Channel, Ranking Channel — langsung dari browser
- 👥 Lihat, edit, reset job, dan hapus data handler
- 🛡️ **Backup & Restore** — download data sebagai file JSON, lalu restore saat pindah server/akun Railway (data tidak ikut hilang)
- 🔄 **Sync dari Channel Ranking** — jika data lokal ter-reset, bot bisa membaca leaderboard di channel ranking dan menyamakan totalDone mengikutinya
- 🖥️ **Tab SYSTEM** — status server live (uptime, RAM, CPU, ping Discord), spesifikasi host, speed test internet, live logs, dan tombol Clear Memory (GC + pangkas cache)
- 🔒 Login dengan password (`ADMIN_PASSWORD`), session 24 jam, rate-limit login

### 💾 Backup / Restore / Sync (tab Handlers)

| Tombol | Fungsi |
|--------|--------|
| **Download Backup** | Simpan seluruh data handler sebagai file `.json` |
| **Restore Backup** | Upload file backup → mengganti seluruh data saat ini |
| **Sync dari Channel Ranking** | Membaca pesan leaderboard di channel ranking Discord, lalu menyesuaikan `totalDone` (nilai tertinggi yang dipertahankan) |

**Tips pindah akun/server Railway:**
1. Sebelum pindah → klik **Download Backup**
2. Deploy repo di akun baru
3. Buka admin panel → **Restore Backup** dengan file tadi
4. (Alternatif tanpa backup) gunakan **Sync dari Channel Ranking** selama leaderboard masih ada di channel

## 🛠️ Menjalankan Lokal

```bash
# 1. Install dependencies
npm install

# 2. Buat file env
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/Mac

# 3. Isi TOKEN, CLIENT_ID, GUILD_ID, ADMIN_PASSWORD di .env
#    Untuk lokal, kosongkan DATA_DIR agar data tersimpan di folder Data/

# 4. Deploy slash commands ke server (sekali saja / saat commands berubah)
npm run deploy-commands

# 5. Jalankan bot (admin panel ikut jalan di http://localhost:3000)
npm start
```

## 📋 Daftar Command Discord

| Command | Fungsi |
|---------|--------|
| `/join` | Daftar sebagai handler (isi max job & jenis layanan) |
| `/take` | Ambil job dari customer |
| `/done` | Tandai job selesai + upload bukti |
| `/leave` | Keluar / tidak ready |
| `/status` | Cek status handler |
| `/ranking` | Lihat leaderboard handler |
| `/menu` | Tampilkan menu bot |

## 🗑️ Menghapus Semua Command

```bash
npm run delete-commands
```

## 📌 Catatan Deploy

- Data handler & config disimpan di file JSON. Di Railway, set `DATA_DIR=/data` + pasang volume di path `/data` agar data **tidak hilang saat redeploy**.
- Deploy pertama kali: data bawaan otomatis disalin ke volume.
- Domain Railway bersifat **publik** — jangan bagikan `ADMIN_PASSWORD` sembarangan.
- Jika token bot pernah bocor, segera **Reset Token** di [Discord Developer Portal](https://discord.com/developers/applications) → aplikasi → **Bot** → **Reset Token**.
