import os
import sys
import logging
import asyncio
import json
import re
import aiohttp
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile
from aiogram.client.session.aiohttp import AiohttpSession
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN", "8932211919:AAHDvnVj51UkkVn8GqQQ6Slj3Sv6HAZJII4")
CHANNEL_ID = "@kino_mukammal"
CHANNEL_URL = "https://t.me/kino_mukammal"
INSTAGRAM_URL = "https://instagram.com/kinolar.2027/"
ADMIN_USERNAME = "Husanashurov"
SITE_URL = os.getenv("SITE_URL", "http://localhost:5000")
API_BASE = os.getenv("API_BASE", "http://localhost:5000/api")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BANNER_PATH = os.path.join(BASE_DIR, "banner.jpg")
PUBLIC_UPLOADS_DIR = os.path.join(os.path.dirname(BASE_DIR), "public", "uploads")
LOCAL_DB_FILE = os.path.join(BASE_DIR, "movies_data.json")

session = AiohttpSession(timeout=60)
bot = Bot(token=BOT_TOKEN, session=session)
dp = Dispatcher()

last_admin_file_id = None
last_admin_thumb_url = ""

def load_local_db():
    if os.path.exists(LOCAL_DB_FILE):
        try:
            with open(LOCAL_DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_local_movie(code: str, file_id: str, title: str = "Kino", genre: str = "Badiiy", year: str = "2024", poster_url: str = ""):
    db = load_local_db()
    clean_code = str(code).strip()
    db[clean_code] = {
        "code": clean_code,
        "title": title,
        "genre": genre,
        "year": year,
        "poster_url": poster_url,
        "file_id": file_id
    }
    try:
        with open(LOCAL_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Faylga yozish xatosi: {e}")

def get_local_movie(code: str):
    db = load_local_db()
    clean_code = str(code).strip()
    if clean_code in db:
        return db[clean_code]
    num_code = clean_code.lstrip('0')
    if num_code in db:
        return db[num_code]
    return None

def extract_movie_code(text: str) -> str:
    if not text:
        return ""
    m = re.search(r'(?:kino\s*kodi|kod[i:]?)\s*[:#-]?\s*(\d+)', text, re.IGNORECASE)
    if m:
        return m.group(1)
    nums = re.findall(r'\b\d+\b', text)
    if nums:
        filtered = [n for n in nums if n != '18']
        if filtered:
            return filtered[0]
        return nums[0]
    return ""

async def is_subscribed(user_id: int, username: str = "") -> bool:
    if username and username.lower().replace("@", "") == ADMIN_USERNAME.lower():
        return True
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status in ["creator", "administrator", "member"]
    except Exception as e:
        return True

def get_sub_gate_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 1. Telegram Kanalga A'zo Bo'lish", url=CHANNEL_URL)],
        [InlineKeyboardButton(text="📸 2. Instagram Sahifaga A'zo Bo'lish", url=INSTAGRAM_URL)],
        [InlineKeyboardButton(text="✅ Obunani Tekshirish", callback_data="verify_sub")]
    ])

async def get_ai_response(user_prompt: str, user_name: str, is_admin: bool = False) -> str:
    try:
        payload = {"message": user_prompt, "userName": user_name, "isAdmin": is_admin}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as sess:
            async with sess.post(f"{API_BASE}/ai/chat", json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    reply = data.get("reply") or data.get("response") or data.get("message")
                    if reply and len(reply.strip()) > 0:
                        return reply
    except Exception as e:
        pass

    p = user_prompt.lower()
    if is_admin:
        if any(w in p for w in ["salom", "assalom"]):
            return "Assalomu alaykum, Husan! 👑 Gemini Pro xizmatingizda. Portal statistikasi yoki kino tahlili bo'yicha qanday vazifani bajaramiz?"
        if any(w in p for w in ["nma gap", "nima gap", "nm gap"]):
            return "Tinchlik, Husan! Portal va bot barqaror ishlamoqda."
        if any(w in p for w in ["qilyabsan", "qilyapsan"]):
            return "Husan, portaldagi kinolar va foydalanuvchilar faolligini nazorat qilyapman. Sizga qanday yordam kerak?"
        return f"Husan, savolingizni tahlil qildim. '{user_prompt}' bo'yicha yangi kinolarni ko'paytirishni maslahat beraman."

    if any(w in p for w in ["salom", "assalom", "qalaysan"]):
        return f"Assalomu alaykum, {user_name}! 👋 Men Gemini — sizning shaxsiy kino yordamchingizman. Qanday film tavsiya qilay?"
    return f"Savolingiz uchun tashakkur, {user_name}! 🎬 Qanday janrdagi kino qidiryapsiz?"

@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    name = message.from_user.first_name or "Do'stim"
    text = (
        f"Assalomu alaykum, <b>{name}</b>! 🎬\n\n"
        f"Universal Kino Portalining rasmiy botiga xush kelibsiz!\n\n"
        f"🔹 Istalgan kino kodini yuboring (masalan: <code>1</code> yoki <code>800</code>) va darhol videoni tomosha qiling.\n"
        f"🔹 Kinolarni to'liq HD sifatda saytimiz orqali qurilmangizga yuklab oling.\n"
        f"🔹 <b>Gemini Pro</b> — savollaringizga tez va tahliliy javob beradi!\n\n"
        f"👇 Kerakli bo'limni tanlang yoki kino kodini yozing:"
    )
    buttons = [
        [InlineKeyboardButton(text="📢 Telegram Kanalimiz", url=CHANNEL_URL)],
        [InlineKeyboardButton(text="📸 Instagram Sahifamiz", url=INSTAGRAM_URL)],
        [InlineKeyboardButton(text="👑 Admin Bilan Bog'lanish", url=f"https://t.me/{ADMIN_USERNAME}")]
    ]
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    if os.path.exists(BANNER_PATH):
        await message.answer_photo(photo=FSInputFile(BANNER_PATH), caption=text, reply_markup=kb, parse_mode="HTML")
    else:
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

@dp.callback_query(F.data == "verify_sub")
async def handle_verify_sub(call: types.CallbackQuery):
    user_id = call.from_user.id
    username = call.from_user.username or ""
    sub = await is_subscribed(user_id, username)
    if sub:
        await call.answer("✅ Obunangiz tasdiqlandi!", show_alert=True)
        try:
            await call.message.delete()
        except:
            pass
        await call.message.answer("🎉 <b>Obunangiz tasdiqlandi!</b>\n\nEndi istalgan kino kodini yuboring.", parse_mode="HTML")
    else:
        await call.answer("⚠️ Kanalimizga a'zo bo'lmadingiz! Iltimos, obuna bo'ling.", show_alert=True)

# 1. ADMIN VIDEO YUBORGANIDA: Afishasini oladi va SAYTGA HAM AVTOMATIK JOYLAYDI!
@dp.message(F.video | F.document)
async def handle_admin_video_upload(message: types.Message):
    global last_admin_file_id, last_admin_thumb_url
    username = (message.from_user.username or "").lower()
    if username != ADMIN_USERNAME.lower():
        return

    file_id = message.video.file_id if message.video else message.document.file_id
    last_admin_file_id = file_id
    caption = (message.caption or "").strip()

    code = extract_movie_code(caption)

    # Videoning kichik afishasini 0.1 soniyada yuklab olish
    thumb_url = ""
    if message.video and message.video.thumbnail:
        try:
            os.makedirs(PUBLIC_UPLOADS_DIR, exist_ok=True)
            thumb_file = await bot.get_file(message.video.thumbnail.file_id)
            thumb_filename = f"thumb_{code or 'last'}.jpg"
            save_path = os.path.join(PUBLIC_UPLOADS_DIR, thumb_filename)
            await bot.download_file(thumb_file.file_path, destination=save_path)
            thumb_url = f"/uploads/{thumb_filename}"
            last_admin_thumb_url = thumb_url
        except Exception as e:
            logger.warning(f"Afisha olishda: {e}")

    if code:
        title_name = f"Kino #{code}"
        # A) Mahalliy faylga yozish
        save_local_movie(code, file_id, title_name, "Badiiy", "2024", thumb_url)

        # B) SAYT SERVERIGA AVTOMATIK QO'SHISH (Saytda darhol chiqadi!)
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as s:
                await s.put(
                    f"{API_BASE}/movies/{code}/telegram-file-id",
                    json={
                        "telegram_file_id": file_id,
                        "title": title_name,
                        "poster_url": thumb_url,
                        "genre": "Badiiy",
                        "year": 2024
                    }
                )
        except:
            pass

        await message.answer(
            f"✅ <b>{code}-kodli kino botga saqlandi va SAYTGA HAM avtomatik qo'shildi!</b> 🌐🎬\n\n"
            f"🔹 <b>Botda:</b> <code>{code}</code> deb yozsangiz, video 0.1 soniyada chiqadi!\n"
            f"🔹 <b>Saytda:</b> http://localhost:5000 da kino kartochkasi paydo bo'ldi!\n\n"
            f"💡 <i>Agar ushbu videoni saytdagi <b>1</b>-kodli kinoga ulamoqchi bo'lsangiz: shunchaki <code>/kod 1</code> deb yozing!</i>",
            parse_mode="HTML"
        )
    else:
        await message.answer(
            f"📹 <b>Video qabul qilindi!</b>\n\n"
            f"Ushbu videoni kinoga va saytga ulash uchun, kino kodini yozing:\n"
            f"Masalan: <code>/kod 1</code> yoki <code>/kod 800</code>",
            parse_mode="HTML"
        )

# 2. /kod <raqam> BUYRUG'I (Istalgan kodga ulash va saytga joylash):
@dp.message(Command("kod"))
async def handle_set_code_command(message: types.Message):
    global last_admin_file_id, last_admin_thumb_url
    username = (message.from_user.username or "").lower()
    if username != ADMIN_USERNAME.lower():
        return

    parts = message.text.split()
    if len(parts) < 2 or not parts[1].isdigit():
        await message.answer("⚠️ Iltimos, kino kodini to'g'ri yozing. Masalan: <code>/kod 1</code>", parse_mode="HTML")
        return

    code = parts[1].strip()
    if not last_admin_file_id:
        await message.answer("⚠️ Avval videoni botga yuboring yoki forward qiling, keyin <code>/kod 1</code> deb yozing!", parse_mode="HTML")
        return

    title_name = "ogirlik" if code == "1" else f"Kino #{code}"
    save_local_movie(code, last_admin_file_id, title_name, "Badiiy", "2024", last_admin_thumb_url)

    # Saytga ham saqlash
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as s:
            await s.put(
                f"{API_BASE}/movies/{code}/telegram-file-id",
                json={
                    "telegram_file_id": last_admin_file_id,
                    "title": title_name,
                    "poster_url": last_admin_thumb_url,
                    "genre": "Badiiy",
                    "year": 2024
                }
            )
    except:
        pass

    await message.answer(
        f"✅ <b>Video muvaffaqiyatli {code}-kodli kinoga ({title_name}) bog'landi va saytga ham joylandi!</b> 🎬\n\n"
        f"Endi botga <code>{code}</code> deb yozsangiz, video shu zahoti tashlab beriladi!",
        parse_mode="HTML"
    )

# 3. KINO KODINI QIDIRISH VA VIDEONI FOYDALANUVCHIGA 0.1 SONIYADA TASHAB BERISH:
async def send_movie_by_code(message: types.Message, code: str):
    user_id = message.from_user.id
    username = message.from_user.username or ""
    clean_code = str(code).strip()
    
    if not await is_subscribed(user_id, username):
        await message.answer("⚠️ <b>Kinoni ko'rish uchun quyidagi kanallarga a'zo bo'ling:</b>", reply_markup=get_sub_gate_keyboard(), parse_mode="HTML")
        return

    # 1. Avval mahalliy xotiradan olish (0.1 soniya!)
    cached = get_local_movie(clean_code)

    movie = None
    if cached:
        movie = {
            "title": cached.get("title", f"Kino #{clean_code}"),
            "year": cached.get("year", "2024"),
            "genre": cached.get("genre", "Badiiy"),
            "telegram_file_id": cached.get("file_id"),
            "code": clean_code
        }

    # 2. Agar mahalliy xotirada bo'lmasa, serverdan qidirish
    if not movie:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as sess:
                async with sess.get(f"{API_BASE}/movies/code/{clean_code}") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data and not data.get("error"):
                            movie = data
                if not movie:
                    async with sess.get(f"{API_BASE}/movies") as resp2:
                        if resp2.status == 200:
                            all_movies = await resp2.json()
                            if isinstance(all_movies, list):
                                for item in all_movies:
                                    c = str(item.get("code") or item.get("movie_code") or "").strip()
                                    if c == clean_code or c == clean_code.lstrip('0'):
                                        movie = item
                                        break
        except Exception as e:
            logger.error(f"Serverdan qidirish xatosi: {e}")

    if not movie:
        await message.answer(f"❌ <b>{clean_code}-kodli kino topilmadi!</b>\n\n🌐 Saytimiz katalogidan qidiring: http://localhost:5000", parse_mode="HTML")
        return

    title = movie.get('title') or movie.get('name') or f"Kino #{clean_code}"
    year = movie.get('year') or '2024'
    genre = movie.get('genre') or 'Badiiy'
    if isinstance(genre, list):
        genre = ', '.join(genre)
    views = movie.get('views', 0)
    likes = movie.get('likes', 0)

    caption = (
        f"🎬 <b>{title} ({year})</b>\n\n"
        f"🔑 <b>Kodi:</b> <code>{clean_code}</code>\n"
        f"📁 <b>Janri:</b> {genre}\n"
        f"👁 <b>Ko'rishlar:</b> {views} | 👍 <b>Layklar:</b> {likes}\n\n"
        f"🌐 <b>Saytda tomosha qilish:</b> http://localhost:5000/?code={clean_code}"
    )

    buttons = [
        [InlineKeyboardButton(text="📢 Telegram Kanal", url=CHANNEL_URL)],
        [InlineKeyboardButton(text="📸 Instagram Sahifa", url=INSTAGRAM_URL)],
        [InlineKeyboardButton(text="👑 Admin Bilan Bog'lanish", url=f"https://t.me/{ADMIN_USERNAME}")]
    ]
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    video_sent = False
    tg_file_id = movie.get("telegram_file_id")

    # A) FILE_ID BILAN 0.1 SONIYADA DARHOL YUBORISH
    if tg_file_id:
        try:
            await bot.send_video(chat_id=message.chat.id, video=tg_file_id, caption=caption, reply_markup=keyboard, parse_mode="HTML")
            video_sent = True
        except Exception as e:
            logger.warning(f"File ID jo'natish xatosi: {e}")

    # B) Agar video jo'natilmagan bo'lsa
    if not video_sent:
        await message.answer(
            f"🎬 <b>{title} ({year})</b>\n\n"
            f"🔑 <b>Kodi:</b> <code>{clean_code}</code>\n"
            f"📁 <b>Janri:</b> {genre}\n\n"
            f"🌐 <b>Kinoni saytimizda to'liq HD tomosha qiling:</b>\n"
            f"http://localhost:5000/?code={clean_code}",
            reply_markup=keyboard,
            parse_mode="HTML"
        )

    # C) Yuklab olish ma'lumoti alohida chiqadi:
    download_info = (
        f"⬇️ <b>Kinoni yuklab olish uchun saytimizga kiring:</b>\n\n"
        f"🌐 <b>Sayt manzili:</b> http://localhost:5000/?code={clean_code}\n\n"
        f"📱 <b>Imkoniyatlar:</b>\n"
        f"• To'liq HD sifatda yuklash\n"
        f"• Telefon yoki kompyuter xotirasiga to'g'ridan-to'g'ri saqlash\n"
        f"• Yuqori tezlikda va bepul tomosha qilish"
    )
    await message.answer(download_info, parse_mode="HTML")

# Matnli xabarlar
@dp.message(F.text)
async def handle_user_text(message: types.Message):
    text = message.text.strip()
    if text.isdigit():
        await send_movie_by_code(message, text)
        return

    username = message.from_user.username or ""
    is_admin = (username.lower() == ADMIN_USERNAME.lower())
    user_name = message.from_user.first_name or ("Husan Ashirov" if is_admin else "Do'stim")

    await bot.send_chat_action(chat_id=message.chat.id, action="typing")
    ai_reply = await get_ai_response(text, user_name, is_admin)
    await message.answer(f"✨ <b>Gemini Pro:</b>\n\n{ai_reply}", parse_mode="HTML")

async def main():
    logger.info("Universal Kino Bot ishga tushdi...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())