# Bot Barokah

Discord bot untuk manajemen handler job (join, take job, done, status, ranking) menggunakan [discord.js](https://discord.js.org/) v14.

## Menjalankan Lokal

```bash
# 1. Install dependencies
npm install

# 2. Buat file env
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/Mac

# 3. Isi TOKEN, CLIENT_ID, GUILD_ID di .env

# 4. Deploy slash commands ke server (sekali saja / saat commands berubah)
npm run deploy-commands

# 5. Jalankan bot
npm start
```

> Untuk lokal, kosongkan `DATA_DIR` di `.env` agar data disimpan di folder `Data/`.

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

3. Tambahkan **Volume**: klik kanan service → **Add Volume** → mount path `/data`.
   - Volume ini menyimpan `handlerData.json` agar data tidak hilang saat redeploy.
4. Deploy. Cek log sampai muncul: `🔑 Bot berhasil login.`
5. Deploy slash commands (sekali saja). Pilih salah satu:
   - **Lokal**: `npm run deploy-commands` (pakai `.env` lokal)
   - **Railway**: jalankan dari Railway CLI:
     ```bash
     railway run node deploy-commands.js
     ```

### Catatan Penting
- Bot Discord **tidak butuh domain/HTTP port** — Railway service tanpa public domain tetap berjalan normal (worker).
- Data pertama kali deploy akan otomatis disalin dari `Data/handlerData.json` ke volume (jika volume kosong).

## Menghapus Semua Command

```bash
npm run delete-commands
```
