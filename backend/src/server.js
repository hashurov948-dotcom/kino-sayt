const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const pool = require('./config/db');
const movieRoutes = require('./routes/movieRoutes');
const aiController = require('./controllers/aiController');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// 1. 10 GB gacha video fayllar uchun Multer
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const cleanName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, cleanName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 GB
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Fayl tanlanmadi!' });
  }
  const fileUrl = '/uploads/' + req.file.filename;
  res.json({ url: fileUrl });
});

// 2. Auth tizimi (Faqat Husan Admin)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === 'hashurov948@gmail.com' && password === '1wertyu8') {
      return res.json({
        user: { name: 'Husan', email: 'hashurov948@gmail.com', role: 'admin', isAdmin: true }
      });
    }
    res.json({
      user: { name: email ? email.split('@')[0] : 'Foydalanuvchi', email: email || '', role: 'user', isAdmin: false }
    });
  } catch (err) {
    res.status(500).json({ error: 'Kirishda xatolik' });
  }
});

app.post('/api/users/sync', async (req, res) => {
  const { email, name } = req.body;
  const isAdmin = (email === 'hashurov948@gmail.com');
  res.json({
    user: { name: name || (isAdmin ? 'Husan' : 'Foydalanuvchi'), email, role: isAdmin ? 'admin' : 'user', isAdmin }
  });
});

app.post('/api/check-sub', async (req, res) => {
  res.json({ subscribed: true, message: 'Obuna tasdiqlandi' });
});

// 3. AI va Kinolar marshrutlari
app.post('/api/ai/chat', aiController.chat || aiController);
app.use('/api/ai', aiRoutes);
app.use('/api/movies', movieRoutes);

// 4. Frontend statik fayllari
app.use(express.static(path.join(__dirname, '../public')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 5. Bazadagi barcha ustunlarni sinxronlash va cheklovlarni yechish
async function initDatabase() {
  try {
    // Janr ustunini TEXT ga aylantirish
    await pool.query(`
      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE movies ALTER COLUMN genre TYPE TEXT USING array_to_string(genre, ', ');
        EXCEPTION WHEN OTHERS THEN 
          NULL;
        END;

        BEGIN
          ALTER TABLE movies ALTER COLUMN genres TYPE TEXT USING array_to_string(genres, ', ');
        EXCEPTION WHEN OTHERS THEN 
          NULL;
        END;
      END $$;
    `);

    // Ustunlar mavjudligini ta'minlash
    await pool.query(`
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS code TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS movie_code TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS video_url TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS download_url TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS video_urls JSONB;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS poster_url TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS genre TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS year INT DEFAULT 2024;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS telegram_file_id TEXT;
    `);

    // Mavjud kinolarda kod va video havolalarni o'zaro to'ldirish
    await pool.query(`
      UPDATE movies SET code = movie_code WHERE code IS NULL AND movie_code IS NOT NULL;
      UPDATE movies SET movie_code = code WHERE movie_code IS NULL AND code IS NOT NULL;
      UPDATE movies SET video_url = download_url WHERE video_url IS NULL AND download_url IS NOT NULL;
      UPDATE movies SET download_url = video_url WHERE download_url IS NULL AND video_url IS NOT NULL;
    `);

    // Barcha NOT NULL cheklovlarini olib tashlash
    await pool.query(`
      DO $$ 
      DECLARE 
        r RECORD;
      BEGIN 
        FOR r IN (
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'movies' AND column_name NOT IN ('id')
        ) LOOP
          EXECUTE 'ALTER TABLE movies ALTER COLUMN ' || quote_ident(r.column_name) || ' DROP NOT NULL';
        END LOOP;
      END $$;
    `);
    console.log("✅ Baza sxemasi va mavjud kinolar to'liq sinxronlandi!");
  } catch (err) {
    console.warn("Baza moslashuv ogohlantirishi:", err.message);
  }
}

const server = app.listen(PORT, () => {
  console.log(`🚀 Universal Kino Portali http://localhost:${PORT} da ishga tushdi!`);
  initDatabase();
});
// Telegram botni avtomatik birga ishga tushirish
const { spawn } = require('child_process');
const botScript = path.join(__dirname, '../telegram-bot/bot.py');
if (fs.existsSync(botScript)) {
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
  const botProcess = spawn(pythonCmd, [botScript], {
    stdio: 'inherit',
    env: { ...process.env, API_BASE: `http://localhost:${PORT}/api` }
  });
  botProcess.on('error', (err) => console.warn('Bot xatosi:', err.message));
  console.log('🤖 Telegram Bot server bilan birga muvaffaqiyatli ishga tushdi!');
}

server.timeout = 0;
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1860000;