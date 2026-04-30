# db/supabase_client.py
import re

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is missing. Add it to backend/.env.")

if not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_KEY is missing. Add it to backend/.env.")

is_legacy_jwt_key = re.match(
    r"^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$",
    SUPABASE_KEY,
)
is_modern_supabase_key = SUPABASE_KEY.startswith(("sb_publishable_", "sb_secret_"))

if not is_legacy_jwt_key and not is_modern_supabase_key:
    raise RuntimeError(
        "SUPABASE_KEY in backend/.env is not a valid Supabase API key. "
        "Use Project Settings > API Keys and paste either an sb_publishable_ / "
        "sb_secret_ key, or a legacy anon / service_role JWT key."
    )

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

async def save_call_record(
    original_text: str,
    translated_text: str,
    language_code: str,
    language_name: str | None = None,
):
    _ = language_name
    record = {
        "original_text":   original_text,
        "translated_text": translated_text,
        "language_code":   language_code,
    }

    supabase.table("call_records").insert(record).execute()

async def get_call_records():
    result = supabase.table("call_records").select("*").order("created_at", desc=True).execute()
    return result.data
