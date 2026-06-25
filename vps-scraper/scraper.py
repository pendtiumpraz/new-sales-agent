#!/usr/bin/env python3
"""
VPS Scraper Service — Multi-Platform Web Scraper v2
Pakai Scrapling + Playwright untuk scraping berbagai platform.

Platform:
  - website   → Company profile (email, phone, socials)
  - google    → Google Search results
  - linkedin  → LinkedIn public profile/company
  - instagram → Instagram public profile
  - facebook  → Facebook public page
  - tiktok    → TikTok public profile
  - shopee    → Shopee product search
"""

import json
import re
import sys
from urllib.parse import urlparse, quote_plus

from scrapling import Fetcher, StealthyFetcher, Selector


def get_html(resp) -> str:
    """Ambil raw HTML dari Scrapling response."""
    if resp is None:
        return ""
    if isinstance(resp.body, bytes):
        return resp.body.decode("utf-8", errors="replace")
    return str(resp.body) if resp.body else ""


def uniq(arr: list) -> list:
    return list(dict.fromkeys(arr))


def extract_emails(text: str) -> list[str]:
    pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    emails = re.findall(pattern, text)
    return uniq([
        e.lower() for e in emails
        if len(e) <= 60
        and not re.search(r"\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$", e.lower())
        and not re.search(r"@(sentry\.io|example\.com|domain\.com)$", e.lower())
    ])


def extract_phones(text: str) -> list[str]:
    phones = set()
    for m in re.finditer(r"tel:\+?\d[\d\s().-]{6,}", text, re.I):
        phones.add(re.sub(r"^tel:", "", m.group(), flags=re.I).strip())
    for m in re.finditer(r"(?:\+?62|0)8\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}", text):
        phones.add(m.group().strip())
    return list(phones)


def extract_socials(text: str) -> dict:
    socials = {"linkedin": None, "instagram": None, "facebook": None, "twitter": None, "tiktok": None, "youtube": None}
    patterns = {
        "linkedin": r"https?://(?:www\.)?linkedin\.com/(?:company|in)/[a-zA-Z0-9_-]+",
        "instagram": r"https?://(?:www\.)?instagram\.com/[a-zA-Z0-9_.]+/?",
        "facebook": r"https?://(?:www\.)?facebook\.com/[a-zA-Z0-9.]+",
        "twitter": r"https?://(?:www\.)?(?:twitter|x)\.com/[a-zA-Z0-9_]+",
        "tiktok": r"https?://(?:www\.)?tiktok\.com/@[a-zA-Z0-9_.]+",
        "youtube": r"https?://(?:www\.)?youtube\.com/@?[a-zA-Z0-9_-]+",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.I)
        if match:
            socials[key] = match.group().rstrip("/")
    return socials


def extract_name_from_sel(sel) -> str | None:
    """Extract site name dari Scrapling Selector."""
    for tag in ['meta[property="og:site_name"]', 'meta[name="application-name"]']:
        els = sel.css(tag)
        if els and len(els) > 0:
            c = els[0].attrib.get("content", "")
            if c:
                return c.strip()
    title_els = sel.css("title")
    if title_els and len(title_els) > 0:
        t = title_els[0].text or "" if hasattr(title_els[0], "text") else ""
        t = t.strip()
        for sep in [" | ", " - ", " — ", " › "]:
            parts = t.split(sep)
            if len(parts) > 1 and parts[0].strip():
                return parts[0].strip()
        if t:
            return t
    h1 = sel.css("h1")
    if h1 and len(h1) > 0:
        t = h1[0].text or "" if hasattr(h1[0], "text") else ""
        t = t.strip()
        if t and len(t) < 100:
            return t
    return None


def extract_desc_from_sel(sel) -> str | None:
    for tag in ['meta[name="description"]', 'meta[property="og:description"]']:
        els = sel.css(tag)
        if els and len(els) > 0:
            c = els[0].attrib.get("content", "")
            if c:
                return c.strip()
    return None


# =============================================================================
# Stealth fetch helper
# =============================================================================

def stealth_get(url: str, timeout_ms: int = 30000, google_search: bool = False) -> tuple:
    """Fetch URL with StealthyFetcher (headless browser). Returns (resp, error_msg)."""
    kwargs = {
        "headless": True,
        "timeout": timeout_ms,
        "solve_cloudflare": True,
    }
    if google_search:
        kwargs["google_search"] = True

    try:
        resp = StealthyFetcher.fetch(url, **kwargs)
        return resp, None
    except Exception as e:
        return None, str(e)


# =============================================================================
# Platform Scrapers
# =============================================================================

def scrape_website(url: str, timeout: int = 15) -> dict:
    """Company website — email, phone, socials."""
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    url = url.rstrip("/")

    result = {
        "platform": "website",
        "url": url,
        "domain": urlparse(url).netloc,
        "name": None,
        "description": None,
        "emails": [],
        "phones": [],
        "socials": {},
        "items": [],
        "pages_scraped": [],
        "error": None,
    }

    fetcher = Fetcher()
    paths = ["", "/contact", "/kontak", "/about", "/tentang-kami", "/tentang"]
    all_html = ""

    for path in paths:
        page_url = url + path
        try:
            resp = fetcher.get(page_url, timeout=timeout)
            if resp and resp.status == 200:
                html = get_html(resp)
                if html:
                    all_html += html + "\n"
                    result["pages_scraped"].append(page_url)
                    if path == "":
                        sel = Selector(html)
                        result["name"] = result["name"] or extract_name_from_sel(sel)
                        result["description"] = result["description"] or extract_desc_from_sel(sel)
        except Exception:
            pass

    if not all_html:
        result["error"] = f"Gagal scrape {url}"
        return result

    result["emails"] = extract_emails(all_html)
    result["phones"] = extract_phones(all_html)
    result["socials"] = extract_socials(all_html)
    return result


def scrape_google(query: str, count: int = 10, timeout: int = 30) -> dict:
    """Google Search — cari perusahaan/info."""
    url = f"https://www.google.com/search?q={quote_plus(query)}&num={count}&hl=id"
    result = {
        "platform": "google",
        "query": query,
        "url": url,
        "results": [],
        "error": None,
    }

    resp, err = stealth_get(url, timeout_ms=timeout * 1000, google_search=True)
    if err:
        result["error"] = err
        return result
    if not resp or resp.status != 200:
        result["error"] = f"HTTP {resp.status if resp else 'no response'}"
        return result

    for item in resp.css(".MjjYud"):
        h3 = item.css("h3")
        a = item.css('a[href^="http"]')
        span = item.css(".VwiC3b, .lEBKkf")

        if len(h3) == 0 and len(a) == 0:
            continue

        title = h3[0].text.strip() if len(h3) > 0 and h3[0].text else ""
        href = a[0].attrib.get("href", "") if len(a) > 0 else ""
        snippet = span[0].text.strip() if len(span) > 0 and span[0].text else ""

        if title and href:
            result["results"].append({
                "title": title,
                "url": href.split("&")[0] if "http" in href else href,
                "snippet": snippet,
            })

    return result


def scrape_linkedin(url: str, timeout: int = 30) -> dict:
    """LinkedIn public profile/company."""
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    url = url.rstrip("/")

    result = {
        "platform": "linkedin",
        "url": url,
        "name": None,
        "headline": None,
        "description": None,
        "error": None,
    }

    # Google-based fallback: search LinkedIn profile
    username_match = re.search(r"linkedin\.com/(?:in|company)/([a-zA-Z0-9_-]+)", url)
    if username_match:
        search_query = f"site:linkedin.com/in/{username_match.group(1)} OR site:linkedin.com/company/{username_match.group(1)}"
        resp, err = stealth_get(
            f"https://www.google.com/search?q={quote_plus(search_query)}&num=3&hl=id",
            timeout_ms=timeout * 1000,
            google_search=True,
        )
        if resp and resp.status == 200:
            for item in resp.css(".MjjYud"):
                h3 = item.css("h3")
                a = item.css('a[href^="http"]')
                span = item.css(".VwiC3b, .lEBKkf")

                if len(h3) > 0 and h3[0].text:
                    result["name"] = h3[0].text.strip()
                if len(span) > 0 and span[0].text:
                    result["headline"] = span[0].text.strip()[:200]
                break

    # Try direct LinkedIn fetch
    resp, err = stealth_get(url, timeout_ms=timeout * 1000)
    if err:
        if not result["name"]:
            result["error"] = f"LinkedIn butuh login: {err}"
        return result
    if resp and resp.status == 200:
        html = get_html(resp)
        sel = Selector(html)
        result["name"] = result["name"] or extract_name_from_sel(sel)
        result["description"] = extract_desc_from_sel(sel)
        result["emails"] = extract_emails(html)

    return result


def scrape_instagram(username: str, timeout: int = 30) -> dict:
    """Instagram public profile."""
    username = username.strip().lstrip("@")
    if not username.startswith("http"):
        url = f"https://www.instagram.com/{username}/"
    else:
        url = username.rstrip("/")

    result = {
        "platform": "instagram",
        "username": username,
        "url": url,
        "name": None,
        "bio": None,
        "followers": None,
        "following": None,
        "posts": None,
        "error": None,
    }

    resp, err = stealth_get(url, timeout_ms=timeout * 1000)
    if err:
        result["error"] = err
        return result
    if not resp or resp.status != 200:
        result["error"] = f"HTTP {resp.status if resp else 'no response'}"
        return result

    html = get_html(resp)

    # Extract from __INITIAL_STATE__
    init_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?});', html)
    if init_match:
        try:
            data = json.loads(init_match.group(1))
            user = data.get("user", {})
            if user:
                result["followers"] = user.get("edge_followed_by", {}).get("count")
                result["following"] = user.get("edge_follow", {}).get("count")
                result["posts"] = user.get("edge_owner_to_timeline_media", {}).get("count")
        except Exception:
            pass

    sel = Selector(html)
    result["name"] = extract_name_from_sel(sel)
    result["bio"] = extract_desc_from_sel(sel)
    result["emails"] = extract_emails(html)

    return result


def scrape_facebook(url: str, timeout: int = 30) -> dict:
    """Facebook public page."""
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    url = url.rstrip("/")

    result = {
        "platform": "facebook",
        "url": url,
        "name": None,
        "description": None,
        "error": None,
    }

    resp, err = stealth_get(url, timeout_ms=timeout * 1000)
    if err:
        result["error"] = err
        return result
    if resp and resp.status == 200:
        html = get_html(resp)
        sel = Selector(html)
        result["name"] = extract_name_from_sel(sel)
        result["description"] = extract_desc_from_sel(sel)
        result["emails"] = extract_emails(html)
    else:
        result["error"] = f"HTTP {resp.status if resp else 'no response'} (FB butuh login)"

    return result


def scrape_tiktok(username: str, timeout: int = 30) -> dict:
    """TikTok public profile."""
    username = username.strip().lstrip("@")
    if not username.startswith("http"):
        url = f"https://www.tiktok.com/@{username}"
    else:
        url = username.rstrip("/")

    result = {
        "platform": "tiktok",
        "username": username,
        "url": url,
        "name": None,
        "bio": None,
        "followers": None,
        "following": None,
        "likes": None,
        "error": None,
    }

    resp, err = stealth_get(url, timeout_ms=timeout * 1000)
    if err:
        result["error"] = err
        return result
    if not resp or resp.status != 200:
        result["error"] = f"HTTP {resp.status if resp else 'no response'}"
        return result

    html = get_html(resp)
    sel = Selector(html)
    result["name"] = extract_name_from_sel(sel)
    result["bio"] = extract_desc_from_sel(sel)

    # Extract from __NEXT_DATA__
    next_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>({.*?})</script>', html, re.DOTALL)
    if next_match:
        try:
            data = json.loads(next_match.group(1))
            props = data.get("props", {}).get("pageProps", {})
            user_data = props.get("userData", {}) or props.get("user", {})
            stats = user_data.get("stats", {}) or user_data.get("userInfo", {}).get("stats", {})
            result["followers"] = stats.get("followerCount")
            result["following"] = stats.get("followingCount")
            result["likes"] = stats.get("heartCount")
        except Exception:
            pass

    result["emails"] = extract_emails(html)
    return result


def scrape_shopee(query: str, count: int = 10, timeout: int = 30) -> dict:
    """Shopee product search via Google."""
    url = f"https://www.google.com/search?q={quote_plus(query)}+site:shopee.co.id&num={count}&hl=id"

    result = {
        "platform": "shopee",
        "query": query,
        "results": [],
        "error": None,
    }

    resp, err = stealth_get(url, timeout_ms=timeout * 1000, google_search=True)
    if err:
        result["error"] = err
        return result
    if not resp or resp.status != 200:
        result["error"] = f"HTTP {resp.status if resp else 'no response'}"
        return result

    for item in resp.css(".MjjYud"):
        h3 = item.css("h3")
        a = item.css('a[href^="http"]')
        span = item.css(".VwiC3b, .lEBKkf")

        if len(h3) == 0:
            continue

        title = h3[0].text.strip() if h3[0].text else ""
        href = a[0].attrib.get("href", "") if len(a) > 0 else ""
        snippet = span[0].text.strip() if len(span) > 0 and span[0].text else ""

        if title and href and "shopee.co.id" in href:
            result["results"].append({
                "title": title,
                "url": href.split("&")[0] if "http" in href else href,
                "snippet": snippet,
            })

    return result


# =============================================================================
# Router
# =============================================================================

PLATFORMS = {
    "website": scrape_website,
    "google": scrape_google,
    "linkedin": scrape_linkedin,
    "instagram": scrape_instagram,
    "facebook": scrape_facebook,
    "tiktok": scrape_tiktok,
    "shopee": scrape_shopee,
}


def scrape(platform: str, **params) -> dict:
    handler = PLATFORMS.get(platform)
    if not handler:
        return {"error": f"Platform '{platform}' gak dikenal. Pilihan: {', '.join(PLATFORMS.keys())}"}
    return handler(**params)


# =============================================================================
# CLI Mode
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="VPS Multi-Platform Scraper")
    parser.add_argument("--platform", choices=list(PLATFORMS.keys()), default="website",
                        help="Platform yang mau di-scrape")
    parser.add_argument("--url", help="URL (website, linkedin, facebook)")
    parser.add_argument("--query", help="Kata kunci (google, shopee)")
    parser.add_argument("--username", help="Username (instagram, tiktok)")
    parser.add_argument("--count", type=int, default=10, help="Jumlah hasil (google, shopee)")
    parser.add_argument("--timeout", type=int, default=15, help="Timeout per request (default 15s, google 30s)")
    parser.add_argument("--output", help="File output JSON")

    args = parser.parse_args()

    params = {"timeout": args.timeout}

    if args.platform == "website":
        target = args.url or args.query
        if not target:
            print("❌ Website butuh --url atau --query")
            sys.exit(1)
        params["url"] = target
    elif args.platform in ("google", "shopee"):
        if not args.query:
            print(f"❌ {args.platform} butuh --query")
            sys.exit(1)
        params["query"] = args.query
        params["count"] = args.count
        if args.timeout == 15:
            params["timeout"] = 30  # default lebih panjang buat stealth
        params.setdefault("timeout", args.timeout)
    elif args.platform in ("instagram", "tiktok"):
        target = args.username or args.url
        if not target:
            print(f"❌ {args.platform} butuh --username")
            sys.exit(1)
        params["username"] = target
        if args.timeout == 15:
            params["timeout"] = 30
    elif args.platform in ("linkedin", "facebook"):
        if not args.url:
            print(f"❌ {args.platform} butuh --url")
            sys.exit(1)
        params["url"] = args.url
        if args.timeout == 15:
            params["timeout"] = 30

    result = scrape(args.platform, **params)
    output = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"✅ Hasil disimpan ke: {args.output}")
    else:
        print(output)
