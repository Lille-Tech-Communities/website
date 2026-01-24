import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

type RssItem = {
  title: string;
  link: string;
  pubDate: Date;
  description?: string;
  source: string;
};

async function fetchRssItems(
  feedUrl: string,
  feedName: string,
): Promise<RssItem[]> {
  try {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch ${feedName}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items: RssItem[] = [];

    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const match of itemMatches) {
      const itemContent = match[1];

      const titleMatch = itemContent.match(
        /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/,
      );
      const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
      const descriptionMatch = itemContent.match(
        /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s,
      );

      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].trim(),
          link: linkMatch[1].trim(),
          pubDate: pubDateMatch ? new Date(pubDateMatch[1]) : new Date(),
          description: descriptionMatch ? descriptionMatch[1].trim() : undefined,
          source: feedName,
        });
      }
    }

    return items;
  } catch (error) {
    console.warn(`Error fetching ${feedName}:`, error);
    return [];
  }
}

export const GET: APIRoute = async ({ site, url }) => {
  const rssfeeds = await getCollection("rssfeeds");
  const siteUrl = site?.toString() ?? "https://lille-tech-communities.fr";

  const allItems: RssItem[] = [];

  const newsletterUrl = `${url.origin}/newsletter.xml`;
  const newsletterItems = await fetchRssItems(
    newsletterUrl,
    "Lille Tech Communities",
  );
  allItems.push(...newsletterItems);

  for (const feed of rssfeeds) {
    const items = await fetchRssItems(feed.data.url, feed.data.name);
    allItems.push(...items);
  }

  allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const rssItems = allItems
    .map((item) => {
      const pubDate = item.pubDate.toUTCString();

      return `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.link}</guid>
      <pubDate>${pubDate}</pubDate>
      <source url="${item.link}">${item.source}</source>${item.description ? `\n      <description><![CDATA[${item.description}]]></description>` : ""}
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Lille Tech Communities - Agrégateur</title>
    <link>${siteUrl}</link>
    <description>Flux RSS agrégé des communautés tech de Lille</description>
    <language>fr</language>
    <atom:link href="${siteUrl}/community.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
};
