import { NextResponse } from "next/server";
import { listEmailEvents } from "@/lib/sheets";

export async function GET() {
  try {
    const events = await listEmailEvents();
    return NextResponse.json(events.slice().reverse().slice(0, 200));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load events" },
      { status: 500 },
    );
  }
}
