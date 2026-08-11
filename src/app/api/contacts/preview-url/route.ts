import { NextResponse } from "next/server";
import { fetchPage } from "@/lib/prospect";

export async function POST(req: Request) {
  try {
    const { url, email, fullName } = (await req.json()) as { url?: string; email?: string; fullName?: string };
    if (!url) {
      return NextResponse.json({ error: "Missing URL parameter" }, { status: 400 });
    }

    const html = await fetchPage(url);

    // Extract H1 title or Title tag
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = (h1Match?.[1] || titleMatch?.[1] || url)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Clean html text
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let snippet = "";
    const lowerText = cleanText.toLowerCase();
    const searchTarget = (email || fullName || "").toLowerCase().trim();

    if (searchTarget && lowerText.includes(searchTarget)) {
      const idx = lowerText.indexOf(searchTarget);
      const start = Math.max(0, idx - 250);
      const end = Math.min(cleanText.length, idx + searchTarget.length + 250);
      snippet = cleanText.slice(start, end);
    } else {
      snippet = cleanText.slice(0, 500);
    }

    return NextResponse.json({
      url,
      pageTitle,
      snippet,
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch source preview" },
      { status: 500 },
    );
  }
}
