import { glob } from "astro/loaders";
import { getCollection, z } from "astro:content";
import { defineCollection } from "astro:content";
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

type MeetupData = {
  href: string;
  label: string;
  slug?: string;
  platform?: "meetup" | "mobilizon";
  mobilizonUrl?: string;
};

function loadMeetupsFromFiles(): MeetupData[] {
  const meetupsDir = "./src/content/meetups";
  const meetupFiles = fs
    .readdirSync(meetupsDir)
    .filter((f: string) => f.endsWith(".json"));
  return meetupFiles.map((file: string) => {
    const content = fs.readFileSync(path.join(meetupsDir, file), "utf-8");
    return JSON.parse(content) as MeetupData;
  });
}

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
                  // Chercher le titre dans un élément spécifique (h2, h3, ou span avec classe titre)
                  const titleElement = card.querySelector(
                    "h2, h3, [data-testid='event-title'], [class*='title']",
                  );
                  let title = titleElement?.textContent?.trim() || "";

                  // Si pas trouvé, fallback sur l'analyse des lignes
                  if (!title) {
                    const fullText = (card as HTMLLinkElement).innerText || "";
                    const lines = fullText
                      .split("\n")
                      .map((l) => l.trim())
                      .filter((l) => l.length > 0);

                    // Chercher le titre: ignorer les lignes avec "seats", dates, "Waiting List", etc.
                    for (const line of lines) {
                      if (
                        line.length > 5 &&
                        !line.toLowerCase().includes("seats") &&
                        !line.toLowerCase().includes("waiting list") &&
                        !line.toLowerCase().includes("liste d'attente") &&
                        !line.toLowerCase().includes("spots left") &&
                        !line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/) &&
                        !line.match(/^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?,/) &&
                        !line.match(/^\d+\s+(attendee|going|participant)/)
                      ) {
                        title = line;
                        break;
                      }
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
      const allMeetups = loadMeetupsFromFiles();

      // Scrape Meetup.com events
      const meetupGroups = allMeetups.filter(
        (m) => m.platform === "meetup" && m.slug,
      );
      for (const meetup of meetupGroups) {
        console.log(`🔍 Scraping ${meetup.label}...`);
        const scrapedEvents = await scrapeMeetupEvents(
          meetup.slug!,
          meetup.label,
        );
        data.push({ id: meetup.slug!, events: scrapedEvents });
        console.log(
          `✅ ${meetup.label}:`,
          scrapedEvents.length,
          "événement(s)",
        );
      }

      // Scrape Mobilizon events
      const mobilizonGroups = allMeetups.filter(
        (m) => m.platform === "mobilizon" && m.mobilizonUrl,
      );
      for (const group of mobilizonGroups) {
        console.log(`🔍 Scraping Mobilizon ${group.label}...`);
        const mobilizonEvents = await scrapeMobilizonEvents(
          browser,
          group.mobilizonUrl!,
          group.label,
        );
        const groupId =
          group.mobilizonUrl!.split("/").pop()?.replace("@", "") || group.label;
        data.push({ id: `mobilizon-${groupId}`, events: mobilizonEvents });
        console.log(
          `✅ ${group.label}:`,
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

const MeetupLinkSchema = z.object({
  href: z.string(),
  label: z.string(),
  slug: z.string().optional(),
  platform: z.enum(["meetup", "mobilizon"]).optional(),
  mobilizonUrl: z.string().optional(),
  community: z.boolean().default(false),
});

const meetupsLinks = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/meetups" }),
  schema: MeetupLinkSchema,
});

const RssFeedSchema = z.object({
  name: z.string(),
  url: z.string().url(),
});

const rssfeeds = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/rssfeeds" }),
  schema: RssFeedSchema,
});

export const collections = {
  events,
  mdEvents,
  mailinglists,
  meetups: meetupsLinks,
  rssfeeds,
};
