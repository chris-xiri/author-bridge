import { getEnv } from "./env";

export interface SerpResultItem {
  title: string;
  link: string;
  snippet?: string;
}

interface SerpApiResponse {
  organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  organic?: Array<{ title?: string; link?: string; snippet?: string }>;
}

export async function searchSerpApi(query: string, num = 10): Promise<SerpResultItem[]> {
  const { SERPAPI_API_KEY, SERPER_API_KEY } = getEnv();

  if (SERPER_API_KEY) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Serper request failed: ${res.status}`);
    }
    const data = (await res.json()) as SerpApiResponse;
    const org = Array.isArray(data.organic)
      ? data.organic
      : Array.isArray(data.organic_results)
        ? data.organic_results
        : [];
    return org.map((item) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
    }));
  }

  if (!SERPAPI_API_KEY) {
    throw new Error("Missing SERPAPI_API_KEY or SERPER_API_KEY");
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(num));
  url.searchParams.set("api_key", SERPAPI_API_KEY);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`SerpAPI request failed: ${res.status}`);
  }
  const data = (await res.json()) as SerpApiResponse;
  const org = Array.isArray(data.organic_results) ? data.organic_results : [];
  return org.map((item) => ({
    title: item.title ?? "",
    link: item.link ?? "",
    snippet: item.snippet ?? "",
  }));
}

export async function fetchPage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const res = await fetch(url, { cache: "no-store", signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`Page request failed: ${res.status}`);
  return res.text();
}

export function findStaffLikeLinks(html: string, baseUrl: string) {
  const links = Array.from(
    html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  )
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((x) => /staff|faculty|directory|library|media specialist|instructional technology/i.test(`${x.href} ${x.text}`));

  const resolved = links
    .map((x) => {
      try {
        return new URL(x.href, baseUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return Array.from(new Set(resolved)).slice(0, 5);
}
