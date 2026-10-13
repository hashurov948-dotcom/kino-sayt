const express = require('express');
const router = express.Router();
const movieController = require('../controllers/movieController');

router.get('/', movieController.getMovies);
// Bot uchun maxsus yo'l (ustuvor tartibda):
router.get('/code/:code', movieController.getMovieByCode);
router.get('/:code', movieController.getMovieByCode);

router.post('/', movieController.createMovie);
router.delete('/:code', movieController.deleteMovieByCode);
router.post('/:code/views', movieController.incrementViews);
router.post('/:code/like', movieController.likeMovie);
router.post('/like/:code', movieController.likeMovie);

// Telegram file_id yangilash
router.put('/:code/file_id', movieController.updateTelegramFileId);
router.patch('/:code/file_id', movieController.updateTelegramFileId);
router.put('/code/:code/file_id', movieController.updateTelegramFileId);
router.patch('/code/:code/file_id', movieController.updateTelegramFileId);
router.put('/:code/telegram-file-id', movieController.updateTelegramFileId);
router.patch('/:code/telegram-file-id', movieController.updateTelegramFileId);

router.delete('/:code', movieController.deleteMovieByCode);
router.delete('/delete/:code', movieController.deleteMovieByCode);
router.delete('/code/:code', movieController.deleteMovieByCode);
router.post('/delete/:code', movieController.deleteMovieByCode);
router.post('/:code/delete', movieController.deleteMovieByCode);

module.exports = router;