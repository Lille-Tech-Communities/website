import { glob } from "astro/loaders";
import { getCollection, z } from "astro:content";
import { defineCollection } from "astro:content";
import puppeteer from "puppeteer";

const meetups: Record<string, string> = {
  chtijug: "Ch'ti JUG",
  reactbeerlille: "React Beer Lille",
  "lille-aws-amazon-web-services-user-group": "Lille AWS User Group",
};

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
