import { glob } from "astro/loaders";
import { getCollection, z } from "astro:content";
import { defineCollection } from "astro:content";
import puppeteer from "puppeteer";
const meetups = ["edinburghjs"];

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
  time: z.string(),
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
      time: z.string(),
    })
  ),
});
export type MeetupEvent = Required<z.infer<typeof EventSchema>>;

const events = defineCollection({
  loader: async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    async function scrapeMeetupEvents(meetup: string) {
      const page = await browser.newPage();

      await page.goto(`https://www.meetup.com/${meetup}/events/`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      try {
        await page.waitForSelector(
          'a[href^="https://www.meetup.com/' + meetup + '/events/"]',
          {
            timeout: 20000,
          }
        );
      } catch (err) {
        console.warn(
          "⚠️ Aucun événement visible sur la page (ou chargement trop lent)."
        );
        await browser.close();
        return [];
      }
      const events = await page.evaluate((meetup: string) => {
        const cards = document.querySelectorAll(
          'a[href^="https://www.meetup.com/' + meetup + '/events/"]'
        );

        return Array.from(cards)
          .filter((card) => {
            return !["Events", "List", "Calendar", "Upcoming"].includes(
              (card as HTMLLinkElement).innerText?.trim()
            );
          })
          .map((card, i) => {
            const title = card.querySelector("span")!.innerText.trim();
            const time = card.querySelector("time")!.innerText.trim();
            const link = (card as HTMLLinkElement).href;

            return { title, link, time };
          });
      }, meetup);

      return events;
    }

    let data: MeetupEvent[] = [];
    for (let i = 0; i < meetups.length; i++) {
      const events = await scrapeMeetupEvents(meetups[i]);
      data.push({ id: `${meetups[i]}`, events });
      console.log(events);
    }
    await browser.close();

    console.log(data);
    return data;
  },
  schema: EventSchema,
});

export const collections = { events, mdEvents };
