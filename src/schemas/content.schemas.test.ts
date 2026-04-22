import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schémas à tester (extraits de content.config.ts)
const MarkdownEventSchema = z.object({
  title: z.string(),
  link: z.string(),
  time: z.string().or(z.date()),
  endTime: z.string().or(z.date()).optional(),
  meetup: z.string().optional(),
  speaker: z.string().optional(),
});

const MailingListSchema = z.object({
  title: z.string(),
  date: z.string().or(z.date()),
  description: z.string().optional(),
  draft: z.boolean().default(false),
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

const RssFeedSchema = z.object({
  name: z.string(),
  url: z.url(),
});

const BlogSchema = z.object({
  name: z.string(),
  url: z.url(),
  rss: z.url(),
});

describe("Content Schemas", () => {
  describe("MarkdownEventSchema", () => {
    it("devrait valider un événement valide avec string time", () => {
      const validEvent = {
        title: "Test Event",
        link: "https://example.com",
        time: "2026-03-15T18:00:00",
      };
      const result = MarkdownEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("devrait valider un événement valide avec Date time", () => {
      const validEvent = {
        title: "Test Event",
        link: "https://example.com",
        time: new Date("2026-03-15"),
      };
      const result = MarkdownEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("devrait valider un événement avec des champs optionnels", () => {
      const validEvent = {
        title: "Test Event",
        link: "https://example.com",
        time: "2026-03-15T18:00:00",
        endTime: "2026-03-15T20:00:00",
        meetup: "Tech Meetup",
        speaker: "John Doe",
      };
      const result = MarkdownEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("devrait échouer si title est manquant", () => {
      const invalidEvent = {
        link: "https://example.com",
        time: "2026-03-15T18:00:00",
      };
      const result = MarkdownEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it("devrait échouer si link est manquant", () => {
      const invalidEvent = {
        title: "Test Event",
        time: "2026-03-15T18:00:00",
      };
      const result = MarkdownEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it("devrait échouer si time est manquant", () => {
      const invalidEvent = {
        title: "Test Event",
        link: "https://example.com",
      };
      const result = MarkdownEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe("MailingListSchema", () => {
    it("devrait valider une newsletter valide", () => {
      const validNewsletter = {
        title: "Newsletter #1",
        date: "2026-03-01",
      };
      const result = MailingListSchema.safeParse(validNewsletter);
      expect(result.success).toBe(true);
    });

    it("devrait valider avec Date object", () => {
      const validNewsletter = {
        title: "Newsletter #1",
        date: new Date("2026-03-01"),
      };
      const result = MailingListSchema.safeParse(validNewsletter);
      expect(result.success).toBe(true);
    });

    it("devrait valider avec description", () => {
      const validNewsletter = {
        title: "Newsletter #1",
        date: "2026-03-01",
        description: "Description de la newsletter",
      };
      const result = MailingListSchema.safeParse(validNewsletter);
      expect(result.success).toBe(true);
    });

    it("devrait avoir draft=false par défaut", () => {
      const newsletter = {
        title: "Newsletter #1",
        date: "2026-03-01",
      };
      const result = MailingListSchema.parse(newsletter);
      expect(result.draft).toBe(false);
    });

    it("devrait accepter draft=true", () => {
      const newsletter = {
        title: "Newsletter #1",
        date: "2026-03-01",
        draft: true,
      };
      const result = MailingListSchema.parse(newsletter);
      expect(result.draft).toBe(true);
    });
  });

  describe("MeetupLinkSchema", () => {
    it("devrait valider un meetup minimal", () => {
      const validMeetup = {
        href: "https://meetup.com/group",
        label: "Tech Meetup",
      };
      const result = MeetupLinkSchema.safeParse(validMeetup);
      expect(result.success).toBe(true);
    });

    it("devrait valider un meetup avec platform", () => {
      const validMeetup = {
        href: "https://meetup.com/group",
        label: "Tech Meetup",
        platform: "meetup" as const,
        slug: "tech-meetup",
      };
      const result = MeetupLinkSchema.safeParse(validMeetup);
      expect(result.success).toBe(true);
    });

    it("devrait valider tous les types de platform", () => {
      const platforms = ["meetup", "mobilizon", "luma", "sfeir"] as const;
      platforms.forEach((platform) => {
        const meetup = {
          href: "https://example.com",
          label: "Test",
          platform,
        };
        const result = MeetupLinkSchema.safeParse(meetup);
        expect(result.success).toBe(true);
      });
    });

    it("devrait avoir community=false par défaut", () => {
      const meetup = {
        href: "https://example.com",
        label: "Test",
      };
      const result = MeetupLinkSchema.parse(meetup);
      expect(result.community).toBe(false);
    });

    it("devrait accepter un filtre", () => {
      const meetup = {
        href: "https://example.com",
        label: "Test",
        filter: "Lille",
      };
      const result = MeetupLinkSchema.safeParse(meetup);
      expect(result.success).toBe(true);
    });

    it("devrait échouer avec une platform invalide", () => {
      const invalidMeetup = {
        href: "https://example.com",
        label: "Test",
        platform: "invalid",
      };
      const result = MeetupLinkSchema.safeParse(invalidMeetup);
      expect(result.success).toBe(false);
    });
  });

  describe("RssFeedSchema", () => {
    it("devrait valider un flux RSS valide", () => {
      const validFeed = {
        name: "Tech Blog",
        url: "https://example.com/feed.xml",
      };
      const result = RssFeedSchema.safeParse(validFeed);
      expect(result.success).toBe(true);
    });

    it("devrait échouer avec une URL invalide", () => {
      const invalidFeed = {
        name: "Tech Blog",
        url: "not-a-url",
      };
      const result = RssFeedSchema.safeParse(invalidFeed);
      expect(result.success).toBe(false);
    });

    it("devrait échouer si name est manquant", () => {
      const invalidFeed = {
        url: "https://example.com/feed.xml",
      };
      const result = RssFeedSchema.safeParse(invalidFeed);
      expect(result.success).toBe(false);
    });
  });

  describe("BlogSchema", () => {
    it("devrait valider un blog valide", () => {
      const validBlog = {
        name: "Tech Blog",
        url: "https://example.com",
        rss: "https://example.com/feed.xml",
      };
      const result = BlogSchema.safeParse(validBlog);
      expect(result.success).toBe(true);
    });

    it("devrait échouer avec une URL invalide", () => {
      const invalidBlog = {
        name: "Tech Blog",
        url: "not-a-url",
        rss: "https://example.com/feed.xml",
      };
      const result = BlogSchema.safeParse(invalidBlog);
      expect(result.success).toBe(false);
    });

    it("devrait échouer avec un RSS invalide", () => {
      const invalidBlog = {
        name: "Tech Blog",
        url: "https://example.com",
        rss: "not-a-url",
      };
      const result = BlogSchema.safeParse(invalidBlog);
      expect(result.success).toBe(false);
    });

    it("devrait échouer si un champ est manquant", () => {
      const invalidBlog = {
        name: "Tech Blog",
        url: "https://example.com",
      };
      const result = BlogSchema.safeParse(invalidBlog);
      expect(result.success).toBe(false);
    });
  });
});
