import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async ({ site }) => {
  const newsletters = await getCollection("mailinglists");

  const publishedNewsletters = newsletters
    .filter((newsletter) => !newsletter.data.draft)
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
    );

  const siteUrl = site?.toString() ?? "https://lille-tech-communities.fr";

  const rssItems = publishedNewsletters
    .map((newsletter) => {
      const pubDate = new Date(newsletter.data.date).toUTCString();
      const link = `${siteUrl}/mailinglists/${newsletter.id}`;

      return `    <item>
      <title><![CDATA[${newsletter.data.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>${newsletter.data.description ? `\n      <description><![CDATA[${newsletter.data.description}]]></description>` : ""}
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Lille Tech Communities - Newsletter</title>
    <link>${siteUrl}</link>
    <description>Les dernières actualités des communautés tech de Lille</description>
    <language>fr</language>
    <atom:link href="${siteUrl}/newsletter.xml" rel="self" type="application/rss+xml"/>
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
