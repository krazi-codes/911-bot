# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from api.websocket import websocket_endpoint
from api.call_routes import router as call_router
from db.supabase_client import save_call_record
import asyncio
import httpx
from config import ELEVENLABS_API_KEY

app = FastAPI(title="Rescue Remix Backend")
app.include_router(call_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "service": "Rescue Remix backend"}

# REST routes
app.include_router(router)

# WebSocket
app.add_websocket_route("/ws/dispatch", websocket_endpoint)

async def poll_new_calls():
    seen_ids = set()
    first_run = True

    while True:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.elevenlabs.io/v1/convai/conversations",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                )
                conversations = response.json().get("conversations", [])

                if first_run:
                    for conv in conversations:
                        seen_ids.add(conv.get("conversation_id"))
                    first_run = False
                    print("✅ Monitoring started, waiting for new calls...")
                else:
                    for conv in conversations:
                        conv_id = conv.get("conversation_id")
                        status = conv.get("status")
                        if conv_id not in seen_ids and status == "done":
                            seen_ids.add(conv_id)
                            detail = await client.get(
                                f"https://api.elevenlabs.io/v1/convai/conversations/{conv_id}",
                                headers={"xi-api-key": ELEVENLABS_API_KEY},
                            )
                            detail_data = detail.json()
                            transcript = detail_data.get("transcript", [])
                            print(f"\n📞 New Call: {conv_id}")
                            print(f"📋 {conv.get('call_summary_title')}")
                            for msg in transcript:
                                print(f"  {msg.get('role')}: {msg.get('message')}")

                            transcript_text = "\n".join(
                                f"{m.get('role')}: {m.get('message', '')}"
                                for m in transcript
                            )
                            await save_call_record(
                                original_text=transcript_text,
                                translated_text=conv.get("call_summary_title", ""),
                                language_code=detail_data.get("metadata", {}).get("main_language") or conv.get("main_language", "unknown"),
                            )
        except Exception as e:
            print(f"Error: {e}")

        await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    asyncio.create_task(poll_new_calls())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
