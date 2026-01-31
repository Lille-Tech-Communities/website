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
  platform?: "meetup" | "mobilizon" | "luma" | "sfeir";
  mobilizonUrl?: string;
  lumaCalendarId?: string;
  filter?: string;
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

async function scrapeLumaEvents(
  calendarId: string,
  groupName: string,
): Promise<
  {
    title: string;
    link: string;
    time: string;
    endTime: string;
    meetup: string;
  }[]
> {
  try {
    const response = await fetch(
      `https://api.lu.ma/calendar/get-items?calendar_api_id=${calendarId}`,
    );
    const data = await response.json();
    const entries = data.entries || [];

    return entries.map(
      (entry: {
        event: {
          name: string;
          url: string;
          start_at: string;
          end_at: string;
        };
      }) => ({
        title: entry.event.name,
        link: `https://lu.ma/${entry.event.url}`,
        time: entry.event.start_at,
        endTime: entry.event.end_at,
        meetup: groupName,
      }),
    );
  } catch (err) {
    console.warn(`⚠️ Erreur scraping Luma ${groupName}:`, err);
    return [];
  }
}

const FRENCH_MONTHS: Record<string, string> = {
  JAN: "01",
  FEV: "02",
  MAR: "03",
  AVR: "04",
  MAI: "05",
  JUI: "06",
  JUIL: "07",
  AOU: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

async function scrapeSfeirEvents(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  groupName: string,
): Promise<
  {
    title: string;
    link: string;
    time: string;
    meetup: string;
    location: string;
  }[]
> {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.goto("https://sfeir.com/pages/evenements.html", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await page.waitForSelector(".card", { timeout: 30000 }).catch(() => {
      console.log(
        `⏳ Pas de cartes trouvées pour ${groupName}, on continue...`,
      );
    });

    const events = await page.evaluate((groupName: string) => {
      // Ne cibler que la section "Événements à venir"
      const sections = document.querySelectorAll("section");
      let upcomingSection: Element | null = null;
      for (const section of sections) {
        const heading = section.querySelector("h2");
        if (heading?.textContent?.includes("à venir")) {
          upcomingSection = section;
          break;
        }
      }

      if (!upcomingSection) return [];

      const cards = upcomingSection.querySelectorAll(".card");
      const results: {
        title: string;
        link: string;
        monthAbbr: string;
        day: string;
        meetup: string;
        location: string;
      }[] = [];

      cards.forEach((card) => {
        const title = card.querySelector("h3")?.textContent?.trim() || "";
        const linkEl = card.querySelector(
          'a[href*="/pages/event-"]',
        ) as HTMLAnchorElement | null;
        const link = linkEl
          ? `https://sfeir.com${linkEl.getAttribute("href")}`
          : "";
        const monthEl = card.querySelector(".text-sm.font-semibold");
        const dayEl = card.querySelector(".text-xl.font-bold");
        const monthAbbr = monthEl?.textContent?.trim() || "";
        const day = dayEl?.textContent?.trim().split("-")[0] || "";
        const locationEl = card.querySelector(".text-sm.text-gray-500");
        const location = locationEl?.textContent?.trim() || "";

        if (title && link && monthAbbr && day) {
          results.push({
            title,
            link,
            monthAbbr,
            day,
            meetup: groupName,
            location,
          });
        }
      });

      return results;
    }, groupName);

    await page.close();

    const now = new Date();
    const currentYear = now.getFullYear();

    return events.map((e) => {
      const monthNum = FRENCH_MONTHS[e.monthAbbr.toUpperCase()] || "01";
      let date = new Date(
        `${currentYear}-${monthNum}-${e.day.padStart(2, "0")}T00:00:00`,
      );
      if (date < now) {
        date = new Date(
          `${currentYear + 1}-${monthNum}-${e.day.padStart(2, "0")}T00:00:00`,
        );
      }
      return {
        title: e.title,
        link: e.link,
        time: date.toISOString(),
        meetup: e.meetup,
        location: e.location,
      };
    });
  } catch (err) {
    console.warn(`⚠️ Erreur scraping SFEIR ${groupName}:`, err);
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
        let scrapedEvents = await scrapeMeetupEvents(
          meetup.slug!,
          meetup.label,
        );
        if (meetup.filter) {
          const filterRegex = new RegExp(meetup.filter, "i");
          scrapedEvents = scrapedEvents.filter((e) =>
            filterRegex.test(e.title),
          );
          console.log(`🔎 Filtre "${meetup.filter}" appliqué`);
        }
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

      // Scrape Luma events
      const lumaGroups = allMeetups.filter(
        (m) => m.platform === "luma" && m.lumaCalendarId,
      );
      for (const group of lumaGroups) {
        console.log(`🔍 Scraping Luma ${group.label}...`);
        let lumaEvents = await scrapeLumaEvents(
          group.lumaCalendarId!,
          group.label,
        );
        if (group.filter) {
          const filterRegex = new RegExp(group.filter, "i");
          lumaEvents = lumaEvents.filter((e) => filterRegex.test(e.title));
          console.log(`🔎 Filtre "${group.filter}" appliqué`);
        }
        data.push({ id: `luma-${group.lumaCalendarId}`, events: lumaEvents });
        console.log(`✅ ${group.label}:`, lumaEvents.length, "événement(s)");
      }

      // Scrape SFEIR events
      const sfeirGroups = allMeetups.filter((m) => m.platform === "sfeir");
      for (const group of sfeirGroups) {
        console.log(`🔍 Scraping SFEIR ${group.label}...`);
        let sfeirEvents = await scrapeSfeirEvents(browser, group.label);
        if (group.filter) {
          const filterRegex = new RegExp(group.filter, "i");
          sfeirEvents = sfeirEvents.filter((e) => filterRegex.test(e.location));
          console.log(`🔎 Filtre "${group.filter}" appliqué sur le lieu`);
        }
        data.push({
          id: `sfeir-${group.label.toLowerCase().replace(/\s+/g, "-")}`,
          events: sfeirEvents,
        });
        console.log(`✅ ${group.label}:`, sfeirEvents.length, "événement(s)");
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
  platform: z.enum(["meetup", "mobilizon", "luma", "sfeir"]).optional(),
  mobilizonUrl: z.string().optional(),
  lumaCalendarId: z.string().optional(),
  community: z.boolean().default(false),
  filter: z.string().optional(),
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

const BlogSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  rss: z.string().url(),
});

const blogs = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/blogs" }),
  schema: BlogSchema,
});

export const collections = {
  events,
  mdEvents,
  mailinglists,
  meetups: meetupsLinks,
  rssfeeds,
  blogs,
};
