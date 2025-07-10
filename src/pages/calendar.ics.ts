import ical, { ICalCalendarMethod } from "ical-generator";
import { getAllPosts } from "../content.config";

export async function GET() {
  const calendar = ical({ name: "Lille Events" });

  const events = await getAllPosts();

  calendar.method(ICalCalendarMethod.REQUEST);

  events.forEach((e) => {
    e.events.forEach((e) => {
      const startTime = new Date(e.time);

      let endTime = e.endTime;
      if (!endTime) {
        endTime = new Date(e.time);
        endTime.setHours(startTime.getHours() + 1);
      }

      calendar.createEvent({
        start: startTime,
        end: endTime,
        summary: e.title,
        description: e.title,
        url: e.link,
      });
    });
  });
  return new Response(calendar.toString(), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": 'attachment; filename="event.ics"',
    },
  });
}
