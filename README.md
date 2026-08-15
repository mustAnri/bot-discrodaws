# Bot Barokah

Discord bot untuk manajemen handler job (join, take job, done, status, ranking) menggunakan [discord.js](https://discord.js.org/) v14, dilengkapi **admin panel web** untuk mengatur role/channel ID dan kelola data handler.

## Fitur Admin Panel

- ⚙️ Ubah Handler Role ID, Take/Done Log Channel, Ranking Channel — tanpa edit kode
- 👥 Lihat, edit, reset job, dan hapus data handler
- 🔒 Login dengan password (`ADMIN_PASSWORD`), session 24 jam, rate-limit login

## Menjalankan Lokal

```bash
# 1. Install dependencies
npm install

# 2. Buat file env
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/Mac

# 3. Isi TOKEN, CLIENT_ID, GUILD_ID, ADMIN_PASSWORD di .env

# 4. Deploy slash commands ke server (sekali saja / saat commands berubah)
npm run deploy-commands

# 5. Jalankan bot (admin panel ikut jalan di http://localhost:3000)
npm start
```

> Untuk lokal, kosongkan `DATA_DIR` di `.env` agar data disimpan di folder `Data/`.
> Admin panel bisa diakses di `http://localhost:3000` (login pakai `ADMIN_PASSWORD`).

## Deploy ke Railway

### Persiapan
1. Reset token bot di [Discord Developer Portal](https://discord.com/developers/applications) → aplikasi kamu → **Bot** → **Reset Token** (wajib jika token pernah bocor).
2. Push kode ini ke GitHub (file `.env` sudah di-ignore oleh `.gitignore`).

### Langkah Deploy
1. Buka [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**.
2. Tambahkan **Variables** di service bot:

   | Variable | Nilai |
   |----------|-------|
   | `TOKEN` | Token bot Discord |
   | `CLIENT_ID` | Application ID |
   | `GUILD_ID` | ID server Discord |
   | `DATA_DIR` | `/data` |
   | `ADMIN_PASSWORD` | Password admin panel (buat yang kuat!) |

3. Tambahkan **Volume**: klik kanan service → **Add Volume** → mount path `/data`.
   - Volume ini menyimpan `handlerData.json` dan `config.json` agar data tidak hilang saat redeploy.
4. Deploy. Cek log sampai muncul: `🔑 Bot berhasil login.` dan `🌐 Admin panel berjalan di port ...`
5. **Generate Domain**: Settings service → Networking → **Generate Domain**.
   - Admin panel diakses lewat domain tersebut.
   - ⚠️ Karena admin panel pakai password, **jangan bagikan domain-nya**. Pertimbangkan ubah password (`ADMIN_PASSWORD`) secara berkala.
6. Deploy slash commands (sekali saja). Pilih salah satu:
   - **Lokal**: `npm run deploy-commands` (pakai `.env` lokal)
   - **Railway**: jalankan dari Railway CLI:
     ```bash
     railway run node deploy-commands.js
     ```

### Catatan Penting
- Berbeda dengan bot murni, project ini **membutuhkan domain/public networking** untuk admin panel.
- Data pertama kali deploy akan otomatis disalin dari `Data/handlerData.json` ke volume (jika volume kosong).

## Menghapus Semua Command

```bash
npm run delete-commands
```
