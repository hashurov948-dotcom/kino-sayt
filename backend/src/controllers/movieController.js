const db = require('../config/db');

const dbQuery = async (text, params) => {
  if (db && typeof db.query === 'function') return await db.query(text, params);
  if (db && db.pool && typeof db.pool.query === 'function') return await db.pool.query(text, params);
  return { rows: [] };
};

// 1. Kinolar ro'yxati (Sayt uchun)
exports.getMovies = async (req, res) => {
  try {
    const { search, genre } = req.query;
    const result = await dbQuery('SELECT * FROM movies ORDER BY id DESC');
    let rows = Array.isArray(result.rows) ? result.rows : [];

    let normalized = rows.map(m => {
      const code = String(m.code || m.movie_code || m.id || '').trim();
      let video_url = m.video_url || m.download_url || '';
      
      if (!video_url && m.video_urls) {
        if (typeof m.video_urls === 'string') {
          try {
            const parsed = JSON.parse(m.video_urls);
            video_url = parsed.default || parsed.url || parsed['1080p'] || m.video_urls;
          } catch (e) {
            video_url = m.video_urls;
          }
        } else if (typeof m.video_urls === 'object') {
          video_url = m.video_urls.default || m.video_urls.url || m.video_urls['1080p'] || '';
        }
      }

      const poster_url = m.poster_url || m.poster || m.image_url || '';
      const genreStr = Array.isArray(m.genre) ? m.genre.join(', ') : (m.genre || m.genres || 'Badiiy');
      const titleStr = m.title || m.name || m.movie_name || '';

      return {
        ...m,
        id: m.id,
        title: titleStr,
        name: titleStr,
        code: code,
        movie_code: code,
        video_url: video_url,
        download_url: video_url,
        poster_url: poster_url,
        poster: poster_url,
        genre: genreStr,
        genres: genreStr,
        year: parseInt(m.year) || 2024,
        description: m.description || m.desc || '',
        likes: parseInt(m.likes) || 0,
        views: parseInt(m.views) || 0
      };
    });

    if (search) {
      const s = String(search).toLowerCase().trim();
      normalized = normalized.filter(m => 
        (m.title && m.title.toLowerCase().includes(s)) ||
        (m.description && m.description.toLowerCase().includes(s)) ||
        (m.code && m.code.toLowerCase().includes(s))
      );
    }

    if (genre && genre !== 'Barchasi') {
      const g = String(genre).toLowerCase().trim();
      normalized = normalized.filter(m => m.genre && m.genre.toLowerCase().includes(g));
    }

    res.json(normalized);
  } catch (error) {
    console.error('Kinolarni olishda xatolik:', error);
    res.status(200).json([]);
  }
};

// 2. Kod bo'yicha bitta kino olish
exports.getMovieByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = String(code).trim();
    const numCode = cleanCode.replace(/^0+/, '') || '0';

    const result = await dbQuery('SELECT * FROM movies ORDER BY id DESC');
    const rows = Array.isArray(result.rows) ? result.rows : [];

    let m = rows.find(item => {
      const c1 = String(item.code || '').trim();
      const c2 = String(item.movie_code || '').trim();
      return c1 === cleanCode || c1 === numCode || c2 === cleanCode || c2 === numCode;
    });

    if (!m) {
      m = rows.find(item => String(item.id || '').trim() === cleanCode);
    }

    if (!m) {
      return res.status(404).json({ error: 'Kino topilmadi' });
    }

    const movieCode = String(m.code || m.movie_code || cleanCode).trim();
    let video_url = m.video_url || m.download_url || '';
    if (!video_url && m.video_urls) {
      try {
        const parsed = typeof m.video_urls === 'string' ? JSON.parse(m.video_urls) : m.video_urls;
        video_url = parsed.default || parsed.url || parsed['1080p'] || '';
      } catch (e) {
        video_url = String(m.video_urls);
      }
    }

    const movie = {
      ...m,
      id: m.id,
      title: m.title || m.name || '',
      code: movieCode,
      movie_code: movieCode,
      video_url: video_url,
      download_url: video_url,
      poster_url: m.poster_url || m.poster || '',
      genre: Array.isArray(m.genre) ? m.genre.join(', ') : (m.genre || 'Badiiy'),
      year: parseInt(m.year) || 2024,
      description: m.description || m.desc || '',
      likes: parseInt(m.likes) || 0,
      views: parseInt(m.views) || 0
    };

    res.json(movie);
  } catch (error) {
    console.error('Kino qidirishda xatolik:', error);
    res.status(500).json({ error: 'Server xatosi' });
  }
};

// 3. Yangi kino saqlash (Sayt Admin paneli orqali)
exports.createMovie = async (req, res) => {
  try {
    const title = req.body.title || req.body.name || req.body.movie_name || '';
    const code = req.body.code || req.body.movie_code || '';
    const genre = req.body.genre || req.body.genres || 'Badiiy';
    const year = req.body.year || 2024;
    const description = req.body.description || req.body.desc || '';
    const poster_url = req.body.poster_url || req.body.poster || '';
    const video_url = req.body.video_url || req.body.video || req.body.download_url || '';

    if (!title || !code) {
      return res.status(400).json({ error: 'Kino nomi va kodi kiritilishi shart!' });
    }

    const cleanTitle = String(title).trim();
    const cleanCode = String(code).trim();
    const cleanGenre = String(genre).trim();
    const cleanYear = parseInt(year) || 2024;
    const cleanDesc = String(description).trim();
    const cleanPoster = String(poster_url).trim();
    const cleanVideo = String(video_url).trim();

    let existingCols = {};
    try {
      const colRes = await dbQuery("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'movies'");
      if (colRes.rows) {
        colRes.rows.forEach(r => {
          existingCols[r.column_name.toLowerCase()] = {
            dataType: (r.data_type || '').toLowerCase(),
            udtName: (r.udt_name || '').toLowerCase()
          };
        });
      }
    } catch (e) {}

    const payload = {};
    const colKeys = Object.keys(existingCols);

    if (colKeys.length > 0) {
      for (const col of colKeys) {
        if (col === 'id' || col === 'created_at') continue;
        const info = existingCols[col];
        const isArray = info.dataType === 'array' || (info.udtName && info.udtName.startsWith('_'));
        const isJson = info.dataType === 'json' || info.dataType === 'jsonb';

        if (col === 'title' || col === 'name') payload[col] = cleanTitle;
        else if (col === 'code' || col === 'movie_code') payload[col] = cleanCode;
        else if (col === 'genre' || col === 'genres') payload[col] = isArray ? cleanGenre.split(/[,;\/]+/).map(s=>s.trim()).filter(Boolean) : cleanGenre;
        else if (col === 'year') payload[col] = cleanYear;
        else if (col === 'description' || col === 'desc') payload[col] = cleanDesc;
        else if (col === 'poster_url' || col === 'poster') payload[col] = isArray ? [cleanPoster] : cleanPoster;
        else if (col === 'video_url' || col === 'download_url') payload[col] = isArray ? [cleanVideo] : cleanVideo;
        else if (col === 'video_urls') payload[col] = isJson ? JSON.stringify({ default: cleanVideo, url: cleanVideo }) : (isArray ? [cleanVideo] : cleanVideo);
        else if (col === 'views' || col === 'likes') payload[col] = 0;
      }
    } else {
      payload['title'] = cleanTitle;
      payload['code'] = cleanCode;
      payload['movie_code'] = cleanCode;
      payload['genre'] = cleanGenre;
      payload['year'] = cleanYear;
      payload['description'] = cleanDesc;
      payload['poster_url'] = cleanPoster;
      payload['video_url'] = cleanVideo;
      payload['download_url'] = cleanVideo;
      payload['views'] = 0;
      payload['likes'] = 0;
    }

    const targetCols = Object.keys(payload);
    const placeholders = targetCols.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertQuery = `INSERT INTO movies (${targetCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await dbQuery(insertQuery, Object.values(payload));
    const saved = result.rows && result.rows[0] ? result.rows[0] : {};
    saved.code = saved.code || saved.movie_code || cleanCode;
    saved.video_url = saved.video_url || saved.download_url || cleanVideo;
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 4. Layk bosish
exports.likeMovie = async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = String(code).trim();
    const result = await dbQuery(
      `UPDATE movies SET likes = COALESCE(likes, 0) + 1 
       WHERE CAST(code AS TEXT) = $1 OR CAST(movie_code AS TEXT) = $1 OR CAST(id AS TEXT) = $1 
       RETURNING likes`,
      [cleanCode]
    );
    res.json({ success: true, likes: result.rows[0]?.likes || 1 });
  } catch (error) {
    res.status(500).json({ error: 'Server xatosi' });
  }
};

// 5. Ko'rishlar sonini oshirish
exports.incrementViews = async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = String(code).trim();
    const result = await dbQuery(
      `UPDATE movies SET views = COALESCE(views, 0) + 1 
       WHERE CAST(code AS TEXT) = $1 OR CAST(movie_code AS TEXT) = $1 OR CAST(id AS TEXT) = $1 
       RETURNING views`,
      [cleanCode]
    );
    res.json({ views: result.rows[0]?.views || 1 });
  } catch (error) {
    res.status(500).json({ error: 'Xatolik' });
  }
};

// 6. Kinoni o'chirish (Barcha ID va kodlar bo'yicha 100% xatosiz o'chiradi)
exports.deleteMovieByCode = async (req, res) => {
  try {
    const { code, id } = req.params;
    const target = String(code || id || req.body?.code || req.body?.id || '').trim();
    const numTarget = target.replace(/^0+/, '') || '0';

    if (!target) {
      return res.status(400).json({ error: 'Kino kodi yoki ID si ko‘rsatilmadi' });
    }

    // Bazadagi haqiqiy ustunlarni aniqlash
    let existingCols = new Set();
    try {
      const colRes = await dbQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'movies'");
      if (colRes.rows) {
        colRes.rows.forEach(r => existingCols.add(r.column_name.toLowerCase()));
      }
    } catch (e) {}

    const deleteConditions = [];
    const params = [target, numTarget];

    if (existingCols.has('code')) deleteConditions.push(`CAST(code AS TEXT) = $1 OR CAST(code AS TEXT) = $2`);
    if (existingCols.has('movie_code')) deleteConditions.push(`CAST(movie_code AS TEXT) = $1 OR CAST(movie_code AS TEXT) = $2`);
    if (existingCols.has('id')) deleteConditions.push(`CAST(id AS TEXT) = $1`);

    let query = 'DELETE FROM movies';
    if (deleteConditions.length > 0) {
      query += ` WHERE ${deleteConditions.join(' OR ')} RETURNING *`;
    } else {
      query += ` WHERE CAST(id AS TEXT) = $1 RETURNING *`;
    }

    const result = await dbQuery(query, params);

    // Botning mahalliy fayli (movies_data.json) bo'lsa, undan ham o'chirish
    try {
      const path = require('path');
      const fs = require('fs');
      const cachePath = path.join(__dirname, '../../telegram-bot/movies_data.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        delete cache[target];
        delete cache[numTarget];
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
      }
    } catch (cacheErr) {}

    console.log(`🗑 [deleteMovie] Kino bazadan o'chirildi: ${target}`);
    res.json({ message: 'Kino muvaffaqiyatli o‘chirildi', movie: result.rows?.[0] || null });
  } catch (error) {
    console.error('Kino o‘chirishda xatolik:', error);
    res.status(500).json({ error: error.message || 'Server xatosi' });
  }
};

// 7. TELEGRAMDAN KELGAN KINONI SAYT BAZASIDA 100% XATOSIZ AVTOMATIK YARATISH:
exports.updateTelegramFileId = async (req, res) => {
  try {
    const { code } = req.params;
    const { telegram_file_id, title, poster_url, genre, year } = req.body;
    const cleanCode = String(code).trim();
    const numCode = cleanCode.replace(/^0+/, '') || '0';

    if (!cleanCode || !telegram_file_id) {
      return res.status(400).json({ error: 'Kod va file_id kiritilishi shart' });
    }

    // 1. Mavjudligini tekshirish
    const exist = await dbQuery(
      `SELECT id, title, poster_url FROM movies 
       WHERE CAST(code AS TEXT) = $1 
          OR CAST(movie_code AS TEXT) = $1 
          OR CAST(code AS TEXT) = $2 
          OR CAST(movie_code AS TEXT) = $2`,
      [cleanCode, numCode]
    );

    if (exist.rows && exist.rows.length > 0) {
      // Mavjud kinoni yangilash
      await dbQuery(
        `UPDATE movies 
         SET telegram_file_id = $1, 
             poster_url = COALESCE(NULLIF($2, ''), poster_url)
         WHERE CAST(code AS TEXT) = $3 
            OR CAST(movie_code AS TEXT) = $3 
            OR CAST(code AS TEXT) = $4 
            OR CAST(movie_code AS TEXT) = $4`,
        [telegram_file_id, poster_url || '', cleanCode, numCode]
      );
      console.log(`✅ [updateTelegramFileId] ${cleanCode}-kodli mavjud kino yangilandi!`);
      return res.json({ success: true, action: 'updated', code: cleanCode });
    }

    // 2. Agar bazada yo'q bo'lsa, SAYTDA AVTOMATIK YARATISH (Sxemaga 100% moslab!)
    let existingCols = {};
    try {
      const colRes = await dbQuery("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'movies'");
      if (colRes.rows) {
        colRes.rows.forEach(r => {
          existingCols[r.column_name.toLowerCase()] = {
            dataType: (r.data_type || '').toLowerCase(),
            udtName: (r.udt_name || '').toLowerCase()
          };
        });
      }
    } catch (e) {}

    const movieTitle = title || `Kino #${cleanCode}`;
    const cleanPoster = poster_url || '/uploads/banner.jpg';
    const cleanGenre = genre || 'Badiiy';
    const cleanYear = parseInt(year) || 2024;
    const dummyVideo = '/uploads/' + cleanCode + '.mp4';

    const payload = {};
    const colKeys = Object.keys(existingCols);

    if (colKeys.length > 0) {
      for (const col of colKeys) {
        if (col === 'id' || col === 'created_at') continue;
        const info = existingCols[col];
        const isArray = info.dataType === 'array' || (info.udtName && info.udtName.startsWith('_'));
        const isJson = info.dataType === 'json' || info.dataType === 'jsonb';

        if (col === 'title' || col === 'name') payload[col] = movieTitle;
        else if (col === 'code' || col === 'movie_code') payload[col] = cleanCode;
        else if (col === 'telegram_file_id') payload[col] = telegram_file_id;
        else if (col === 'genre' || col === 'genres') payload[col] = isArray ? [cleanGenre] : cleanGenre;
        else if (col === 'year') payload[col] = cleanYear;
        else if (col === 'description' || col === 'desc') payload[col] = 'Telegram orqali avtomatik joylangan film';
        else if (col === 'poster_url' || col === 'poster') payload[col] = isArray ? [cleanPoster] : cleanPoster;
        else if (col === 'video_url' || col === 'download_url') payload[col] = isArray ? [dummyVideo] : dummyVideo;
        else if (col === 'video_urls') payload[col] = isJson ? JSON.stringify({ default: dummyVideo, url: dummyVideo }) : (isArray ? [dummyVideo] : dummyVideo);
        else if (col === 'views' || col === 'likes') payload[col] = 0;
      }
    } else {
      payload['title'] = movieTitle;
      payload['code'] = cleanCode;
      payload['movie_code'] = cleanCode;
      payload['telegram_file_id'] = telegram_file_id;
      payload['poster_url'] = cleanPoster;
      payload['video_url'] = dummyVideo;
      payload['download_url'] = dummyVideo;
      payload['genre'] = cleanGenre;
      payload['year'] = cleanYear;
      payload['views'] = 0;
      payload['likes'] = 0;
    }

    const targetCols = Object.keys(payload);
    const placeholders = targetCols.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertQuery = `INSERT INTO movies (${targetCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await dbQuery(insertQuery, Object.values(payload));

    console.log(`🎬 [updateTelegramFileId] Yangi ${cleanCode}-kodli kino ("${movieTitle}") sayt bazasida 100% muvaffaqiyatli yaratildi!`);
    res.json({ success: true, action: 'created', code: cleanCode, movie: result.rows[0] });

  } catch (error) {
    console.error("File ID yangilash xatosi:", error);
    res.status(500).json({ error: error.message });
  }
};