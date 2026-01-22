import { glob } from "astro/loaders";
import { getCollection, z } from "astro:content";
import { defineCollection } from "astro:content";
import puppeteer from "puppeteer";

const meetups: Record<string, string> = {
  "software-craftsmanship-lille": "Software Craftsmanship Lille",
  chtijug: "Ch'ti JUG",
  reactbeerlille: "React Beer Lille",
  "nord-agile": "Nord Agile",
  "lille-aws-amazon-web-services-user-group": "Lille AWS User Group",
};

const mobilizonGroups: { url: string; name: string }[] = [
  { url: "https://mobilizon.fr/@chtitedev", name: "Ch'tite Dev" },
];

export async function getAllPosts(): Promise<MeetupEvent[]> {
  const markdownPosts = await getCollection("mdEvents");
  const apiPosts = await getCollection("events");

  return [
    {
      id: "md",
      events: markdownPosts.map((m) => ({ ...m.data })),
    },
    ...apiPosts.map((p) => p.data),
  ];
}

const MarkdownEventSchema = z.object({
  title: z.string(),
  link: z.string(),
  time: z.string().or(z.date()),
  endTime: z.string().or(z.date()).optional(),
  meetup: z.string().optional(),
  speaker: z.string().optional(),
});

const mdEvents = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/events" }),
  schema: MarkdownEventSchema,
});

const EventSchema = z.object({
  id: z.string(),
  events: z.array(
    z.object({
      title: z.string(),
      link: z.string(),
      time: z.string().or(z.date()),
      endTime: z.string().or(z.date()).optional(),
      meetup: z.string().optional(),
      speaker: z.string().optional(),
    }),
  ),
});
export type MeetupEvent = Required<z.infer<typeof EventSchema>>;

async function scrapeMobilizonEvents(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  groupUrl: string,
  groupName: string,
): Promise<{ title: string; link: string; time: string; meetup: string }[]> {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.goto(`${groupUrl}/events`, {
      waitUntil: "networkidle2",
      timeout: 90000,
    });

    // Attendre que les événements soient chargés
    await page
      .waitForSelector("a[href*='/events/']", { timeout: 30000 })
      .catch(() => {
        console.log(
          `⏳ Pas d'événements trouvés pour ${groupName}, on continue...`,
        );
      });

    const events = await page.evaluate((groupName: string) => {
      const eventLinks = document.querySelectorAll("a[href*='/events/']");
      const results: {
        title: string;
        link: string;
        time: string;
        meetup: string;
      }[] = [];
      const seenLinks = new Set<string>();

      eventLinks.forEach((link) => {
        const href = (link as HTMLAnchorElement).href;

        // Filtrer les liens qui ne sont pas des événements individuels
        if (!href.match(/\/events\/[a-f0-9-]+$/)) return;
        if (seenLinks.has(href)) return;
        seenLinks.add(href);

        // Chercher le titre dans le lien ou ses enfants
        const titleElement = link.querySelector("h3, h4, [class*='title']");
        let title = titleElement?.textContent?.trim() || "";

        if (!title) {
          // Essayer de trouver le titre dans le texte du lien
          const text = link.textContent?.trim() || "";
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          title = lines[0] || "";
        }

        // Chercher la date - Mobilizon utilise <time> avec datetime
        const timeElement =
          link.closest("div")?.querySelector("time") ||
          link.parentElement?.querySelector("time") ||
          link.querySelector("time");
        let time = timeElement?.getAttribute("datetime") || "";

        if (!time) {
          // Chercher dans les éléments parents
          let parent = link.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const timeEl = parent.querySelector("time");
            if (timeEl) {
              time = timeEl.getAttribute("datetime") || "";
              break;
            }
            parent = parent.parentElement;
          }
        }

        if (title && time) {
          results.push({ title, link: href, time, meetup: groupName });
        }
      });

      return results;
    }, groupName);

    await page.close();
    return events;
  } catch (err) {
    console.warn(`⚠️ Erreur scraping Mobilizon ${groupName}:`, err);
    await page.close().catch(() => {});
    return [];
  }
}

const events = defineCollection({
  loader: async () => {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        protocolTimeout: 180000,
      });

      async function scrapeMeetupEvents(
        meetupSlug: string,
        meetupName: string,
      ): Promise<
        { title: string; link: string; time: string; meetup: string }[]
      > {
        const page = await browser!.newPage();

        try {
          await page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          );

          await page.goto(`https://www.meetup.com/${meetupSlug}/events/`, {
            waitUntil: "domcontentloaded",
            timeout: 90000,
          });

          // Attendre que le contenu dynamique soit chargé
          await page
            .waitForFunction(
              () => document.querySelectorAll("time").length > 0,
              { timeout: 30000 },
            )
            .catch(() => {
              console.log(
                `⏳ Pas de time trouvé pour ${meetupSlug}, on continue...`,
              );
            });

          const events = await page.evaluate(
            (meetupSlug: string, meetupName: string) => {
              const cards = document.querySelectorAll(
                `a[href*="/${meetupSlug}/events/"]`,
              );

              return Array.from(cards)
                .filter((card) => {
                  const href = (card as HTMLLinkElement).href;
                  const text = (card as HTMLLinkElement).innerText?.trim();
                  // Filtrer les liens de navigation
                  return (
                    href.includes("/events/") &&
                    !["Events", "List", "Calendar", "Upcoming", ""].includes(
                      text,
                    ) &&
                    card.querySelector("time")
                  );
                })
                .map((card) => {
                  // Le titre est généralement dans le texte complet
                  const fullText = (card as HTMLLinkElement).innerText || "";
                  const lines = fullText
                    .split("\n")
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0);

                  // Chercher le titre: ignorer les lignes avec "seats", dates, etc.
                  let title = "";
                  for (const line of lines) {
                    if (
                      line.length > 5 &&
                      !line.toLowerCase().includes("seats") &&
                      !line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/) &&
                      !line.match(/^\d+\s+(attendee|going)/)
                    ) {
                      title = line;
                      break;
                    }
                  }

                  const timeElement = card.querySelector("time");
                  let time = timeElement?.getAttribute("datetime") || "";
                  time = time.replace(/\[.*\]$/, "");
                  const link = (card as HTMLLinkElement).href;

                  return { title, link, time, meetup: meetupName };
                })
                .filter((e) => e.title && e.time);
            },
            meetupSlug,
            meetupName,
          );

          await page.close();
          return events;
        } catch (err) {
          console.warn(`⚠️ Erreur scraping ${meetupSlug}:`, err);
          await page.close().catch(() => {});
          return [];
        }
      }

      const data: MeetupEvent[] = [];
      for (const [slug, name] of Object.entries(meetups)) {
        console.log(`🔍 Scraping ${name}...`);
        const scrapedEvents = await scrapeMeetupEvents(slug, name);
        data.push({ id: slug, events: scrapedEvents });
        console.log(`✅ ${name}:`, scrapedEvents.length, "événement(s)");
      }

      // Scrape Mobilizon events (using the same browser)
      for (const group of mobilizonGroups) {
        console.log(`🔍 Scraping Mobilizon ${group.name}...`);
        const mobilizonEvents = await scrapeMobilizonEvents(
          browser,
          group.url,
          group.name,
        );
        const groupId =
          group.url.split("/").pop()?.replace("@", "") || group.name;
        data.push({ id: `mobilizon-${groupId}`, events: mobilizonEvents });
        console.log(
          `✅ ${group.name}:`,
          mobilizonEvents.length,
          "événement(s)",
        );
      }

      await browser.close();
      return data;
    } catch (err) {
      console.error("❌ Erreur globale scraping:", err);
      if (browser) await browser.close().catch(() => {});
      return [];
    }
  },
  schema: EventSchema,
});

const MailingListSchema = z.object({
  title: z.string(),
  date: z.string().or(z.date()),
  description: z.string().optional(),
  draft: z.boolean().default(false),
});

const mailinglists = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/mailinglists" }),
  schema: MailingListSchema,
});

export const collections = { events, mdEvents, mailinglists };
