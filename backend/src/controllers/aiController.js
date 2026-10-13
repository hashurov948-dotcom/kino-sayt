const https = require('https');
const path = require('path');
const pool = require('../config/db');

try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  require('dotenv').config();
} catch (e) {}

// Google Gemini API kalit
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Saytdagi kinolarni AI ichki bilishi uchun olish
async function getMoviesContext() {
  try {
    const res = await pool.query('SELECT title, code, movie_code, genre, year, views, likes FROM movies ORDER BY id DESC LIMIT 20');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map(m => 
        `"${m.title || m.name}" (Kod: ${m.code || m.movie_code || m.id}, Janr: ${m.genre || 'Badiiy'}, Ko'rishlar: ${m.views || 0}, Layklar: ${m.likes || 0})`
      ).join('; ');
    }
  } catch (e) {
    console.warn("DB kontekstini olish ogohlantirishi:", e.message);
  }
  return '"ogirlik" (Kod: 1), "Avatar: Suv Yo\'li" (Kod: 1001)';
}

// Google Gemini API ga bevosita HTTPS so'rovi
function callGeminiHttps(apiKey, model, systemPrompt, userMessage) {
  return new Promise((resolve) => {
    if (!apiKey) return resolve(null);

    const postData = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nFoydalanuvchi: ${userMessage}` }]
        }
      ],
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 1000
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(body);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim().length > 0) {
              return resolve(text.trim());
            }
          }
        } catch (e) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// Jonli va mustaqil suhbat mexanizmi (tabiiy insondek javob beradi)
function getNaturalSmartReply(prompt, userName, isUserAdmin) {
  const p = prompt.toLowerCase().trim();
  const name = userName || "Do'stim";

  // Salomlashish
  if (p === 'salom' || p === 'assalom' || p === 'assalomu alaykum' || p.startsWith('salom')) {
    if (isUserAdmin) {
      return `Assalomu alaykum, Husan! 👋 Gemini Pro sizning xizmatingizda. Portal statistikasi, server holati yoki yangi kinolar tahlili bo'yicha qanday vazifa bajaramiz?`;
    }
    return `Assalomu alaykum, ${name}! 👋 Men Gemini — sizning shaxsiy kino yordamchingizman. Bugun qanday film tomosha qilishni xohlaysiz? Janr yoki kayfiyatingizni aytsangiz, ajoyib tavsiyalar beraman! 🍿`;
  }

  // "nma gap", "nima gap"
  if (p === 'nma gap' || p === 'nima gap' || p === 'nm gap' || p.includes('nma gap') || p.includes('nima gap')) {
    if (isUserAdmin) {
      return `Tinchlik, Husan! Portal va Telegram boti barqaror ishlayapti, yangi kinolar muvaffaqiyatli saqlanmoqda. Sizda nima yangiliklar? Qanday tahlil yoki yangi loyiha ustida ishlaymiz?`;
    }
    return `Rahmat, hammasi ajoyib! O'zingizda nima gaplar? Maroqli hordiq chiqarish uchun qanday janrdagi kino ko'rmoqchisiz?`;
  }

  // "nma qilyabsan", "nima qilyapsan"
  if (p.includes('qilyabsan') || p.includes('qilyapsan') || p.includes('ish qilyapsan')) {
    if (isUserAdmin) {
      return `Husan, portaldagi kinolar va foydalanuvchilar faolligini kuzatib boryapman. Sayt va Telegram botingiz foydalanuvchilarga xizmat ko'rsatishga tayyor. Sizga portal boshqaruvi yoki biror kino bo'yicha tahlil kerakmi?`;
    }
    return `Sizga qiziqarli filmlarni tavsiya qilishga va savollaringizga javob berishga tayyor turibman! 🍿 Qanday film ko'rishni reja qilyapsiz?`;
  }

  // Qalaysan
  if (p.includes('qalesan') || p.includes('qalaysan') || p.includes('ishlar')) {
    if (isUserAdmin) {
      return `A'lo darajada, Husan! Portal tizimi soatdek ishlayapti. Yangi premyeralarni qo'shish yoki tahlil qilish bo'yicha buyruqlaringizni kutmoqdaman.`;
    }
    return `Katta rahmat, juda yaxshiman! Sizning kayfiyatingiz qanday? Bugun qanday kino ko'rmoqchisiz?`;
  }

  // Kayfiyat tahlili
  if (p.includes('zerik') || p.includes('charchad') || p.includes('xafa') || p.includes('kayfiyat yoq')) {
    return `Kayfiyatingizni bir zumda ko'tarishning eng yaxshi usuli — maroqli film tomosha qilish! 🍿✨\n\nSizga saytimizdagi eng sara filmlarni tavsiya etaman. Masalan: **"ogirlik"** (Kodi: 1) yoki **"o'rgimchak odam yangi qismi"** (Kodi: 2) filmini ko'rsangiz, vaqtingiz ajoyib o'tadi!`;
  }

  // Tavsiya so'rash
  if (p.includes('tavsiya') || p.includes('maslahat') || p.includes('kino ayt') || p.includes('kino ber')) {
    return `Bugun maroqli dam olishingiz uchun eng sara kinolarimiz: 🎬\n\n• **"ogirlik"** (Kodi: 1) — Adrenalin va hayajonga boy kino\n• **"o'rgimchak odam yangi qismi"** (Kodi: 2) — Ajoyib sarguzasht va fantastika\n\nKino kodini saytda qidiring yoki botga yuboring!`;
  }

  // Har qanday boshqa erkin savol
  if (isUserAdmin) {
    return `Husan, savolingizni tahlil qildim. "${prompt}" masalasi bo'yicha portalimizni yanada rivojlantirish uchun yangi qiziqarli janrlardagi premyera filmlarni ko'paytirishni va foydalanuvchilar uchun qulay imkoniyatlarni kengaytirishni maslahat beraman. Yana qanday savolingiz bor?`;
  }
  return `Savolingiz uchun tashakkur, ${name}! "${prompt}" bo'yicha sizga yordam berishdan mamnunman. Saytimiz orqali istalgan kinoni yuqori sifatda tomosha qilishingiz mumkin. Qanday film qidiryapsiz?`;
}

exports.chat = async (req, res) => {
  try {
    const { message, userName, isAdmin } = req.body;
    const prompt = (message || '').trim();
    const name = userName || "Do'stim";

    if (!prompt) {
      return res.json({ 
        reply: `Assalomu alaykum, ${name}! Men Gemini — sizning shaxsiy yordamchingizman. Qanday savolingiz bor?` 
      });
    }

    const isUserAdmin = Boolean(
      isAdmin || 
      (req.headers['x-admin-email'] === 'hashurov948@gmail.com') ||
      name.toLowerCase().includes('husan') ||
      name.toLowerCase().includes('ashirov')
    );

    const moviesContext = await getMoviesContext();

    let systemPrompt = '';
    if (isUserAdmin) {
      systemPrompt = `Siz "Universal Kino Portali" ning asosiy sun'iy intellekti — GEMINI PRO siz.
Siz hozir sayt egasi va bosh admin Husan Ashirov bilan gaplashyapsiz.
Saytda hozir mavjud kinolar: [${moviesContext}].

ADMIN UCHUN QOIDALAR:
1. Husan Ashirovga samimiy, do'stona va chuqur TAHLILIY (analitik) professional tilda javob bering.
2. Har qanday savolga (portal boshqaruvi, statistika, foydalanuvchilar qiziqishi, kino tahlili, texnologiya, kundalik yoki hayotiy mavzular) erkin, mustaqil va tahliliy yondashing.
3. Hech qachon kinolar ro'yxatini to'liq chiqarib tashlamang!
4. "nma gap", "nma qilyabsan", "salom" kabi savollarga jonli, insoniy, qiziqarli va professional javob bering.`;
    } else {
      systemPrompt = `Siz "Universal Kino Portali" ning rasmiy sun'iy intellekti — GEMINI siz.
Foydalanuvchi: ${name}.
Saytdagi filmlar: [${moviesContext}].

FOYDALANUVCHILAR UCHUN QOIDALAR:
1. Foydalanuvchiga do'stona, samimiy va muloyim kino maslahatchisi sifatida javob bering.
2. Har qanday savoliga (kinolar, kayfiyati, aktyorlar, maslahatlar) to'liq va aqlli javob bering.
3. Ichki portal boshqaruvi yoki admin tahlillarini oddiy foydalanuvchilarga bermang.
4. Kinolar ro'yxatini to'liq qilib xabarga chiqarmang! Faqat so'ralsa 1-2 ta mos film tavsiya qiling.`;
    }

    // 1. Google Gemini Pro / Flash ga murojaat
    let reply = null;
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
    for (const m of models) {
      reply = await callGeminiHttps(GEMINI_API_KEY, m, systemPrompt, prompt);
      if (reply) break;
    }

    if (reply) {
      return res.json({ reply });
    }

    // 2. Agar API javob bermasa, jonli mustaqil javob (ro'yxatsiz!)
    const smartReply = getNaturalSmartReply(prompt, name, isUserAdmin);
    res.json({ reply: smartReply });

  } catch (error) {
    console.error("AI Controller xatosi:", error);
    res.json({ reply: "Assalomu alaykum! Gemini Pro xizmatingizda. Qanday savolingiz bor?" });
  }
};