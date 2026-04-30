import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const agentId =
    process.env.ELEVENLABS_AGENT_ID ??
    process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing ElevenLabs configuration. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID (or NEXT_PUBLIC_ELEVENLABS_AGENT_ID).",
      },
      { status: 500 }
    );
  }

  try {
    // Fetch only the latest conversations for the specific agent.
    // Avoid per-conversation detail fetches here to reduce rate-limit pressure.
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=10`,
      {
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `ElevenLabs conversations request failed (${response.status}): ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching ElevenLabs conversations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
