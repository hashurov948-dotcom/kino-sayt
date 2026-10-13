const db = require('../config/db');

const dbQuery = async (text, params) => {
  if (db && typeof db.query === 'function') return await db.query(text, params);
  if (db && db.pool && typeof db.pool.query === 'function') return await db.pool.query(text, params);
  return { rows: [] };
};

exports.getAnalytics = async (req, res) => {
  try {
    const movieCount = await dbQuery('SELECT COUNT(*) FROM movies');
    const viewsSum = await dbQuery('SELECT SUM(views) FROM movies');
    res.json({
      totals: {
        total_movies: parseInt(movieCount.rows[0]?.count) || 0,
        total_views: parseInt(viewsSum.rows[0]?.sum) || 0
      }
    });
  } catch (err) {
    res.json({ totals: { total_movies: 0, total_views: 0 } });
  }
};