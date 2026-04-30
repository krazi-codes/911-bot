from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from pipeline.call_session import process_call
from db.supabase_client import get_call_records, save_call_record, supabase
import httpx
from config import ELEVENLABS_API_KEY
router = APIRouter()

@router.post("/webhook/elevenlabs")
async def elevenlabs_webhook(request: Request):
    data = await request.json()
    event_type = data.get("type")
    
    # ElevenLabs event types: conversation_initiated, conversation_terminated
    conversation_id = data.get("conversation_id")
    
    if event_type == "conversation_initiated":
        # Get caller ID if available (from metadata or payload)
        metadata = data.get("metadata", {})
        caller_number = metadata.get("caller_id") or "Incoming Call"
        
        supabase.table("active_calls").insert({
            "conversation_id": conversation_id,
            "caller_number": caller_number,
            "status": "ringing"
        }).execute()
        
    elif event_type == "conversation_terminated":
        supabase.table("active_calls").update({
            "status": "ended"
        }).eq("conversation_id", conversation_id).execute()
        
    return {"status": "ok"}

@router.post("/process")
async def process_audio(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    try:
        return await process_call(audio_bytes)
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/calls")
async def get_calls():
    try:
        return await get_call_records()
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/fetch-transcripts")
async def fetch_transcripts():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.elevenlabs.io/v1/convai/conversations",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
            )
            data = response.json()
            conversations = data.get("conversations", [])

            results = []
            for conv in conversations:
                conv_id = conv.get("conversation_id")
                
                detail = await client.get(
                    f"https://api.elevenlabs.io/v1/convai/conversations/{conv_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                )
                detail_data = detail.json()
                transcript = detail_data.get("transcript", [])
                
                print(f"\n📞 Call ID: {conv_id}")
                print(f"📋 Title: {conv.get('call_summary_title')}")
                print(f"🌍 Language: {conv.get('main_language')}")
                print(f"💬 Transcript:")
                for msg in transcript:
                    role = msg.get("role", "")
                    text = msg.get("message", "")
                    print(f"  {role}: {text}")
                
                await save_call_record(
                    original_text=str(transcript),
                    translated_text=conv.get("call_summary_title", ""),
                    language_code=conv.get("main_language", "unknown"),
                    
                )
                
                results.append({
                    "conversation_id": conv_id,
                    "title": conv.get("call_summary_title"),
                    "language": conv.get("main_language"),
                    "transcript": transcript,
                })

            return results
    except Exception as e:
        raise HTTPException(500, str(e))