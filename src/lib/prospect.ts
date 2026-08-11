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
    const serperAttempts = [
      { q: query, num: Math.min(Math.max(num, 1), 10) },
      { q: query },
    ];
    let lastSerperError = "";
    for (const payload of serperAttempts) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (res.ok) {
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
      const errText = (await res.text().catch(() => "")).slice(0, 180);
      lastSerperError = `Serper request failed: ${res.status}${errText ? ` (${errText})` : ""}`;
    }
    if (!SERPAPI_API_KEY) {
      throw new Error(lastSerperError || "Serper request failed");
    }
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
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Page request failed: ${res.status}`);
    return res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export function findStaffLikeLinks(html: string, baseUrl: string) {
  let baseHostname = "";
  try {
    baseHostname = new URL(baseUrl).hostname.replace(/^www\./i, "");
  } catch {
    return [];
  }

  const links = Array.from(
    html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  )
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((x) => /staff|faculty|directory|library|media specialist|instructional technology/i.test(`${x.href} ${x.text}`));

  const resolved = links
    .map((x) => {
      try {
        const u = new URL(x.href, baseUrl);
        const host = u.hostname.replace(/^www\./i, "");
        // Must be same domain or subdomain
        if (!host.endsWith(baseHostname) && !baseHostname.endsWith(host)) {
          return "";
        }
        // Exclude social/external anchors
        if (/\.(pdf|png|jpg|jpeg|gif|css|js)$/i.test(u.pathname)) return "";
        if (/facebook|twitter|instagram|linkedin|youtube|google\.com\/maps|booking/i.test(u.href)) return "";
        return u.toString();
      } catch {
        return "";
      }
    })
    .filter((u) => u && u !== baseUrl);

  return Array.from(new Set(resolved)).slice(0, 5);
}
