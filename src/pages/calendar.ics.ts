import ical, { ICalCalendarMethod } from "ical-generator";
import { getAllPosts } from "../content.config";

function parseEventDate(time: string | Date): Date | null {
  if (time instanceof Date) {
    return time;
  }

  const directParse = new Date(time);
  if (!isNaN(directParse.getTime())) {
    return directParse;
  }

  // Format Meetup: "Tue, Jan 20 · 5:30 PM UTC"
  const meetupMatch = time.match(
    /(\w+),\s+(\w+)\s+(\d+)\s+·\s+(\d+):(\d+)\s+(AM|PM)\s*(\w+)?/i,
  );
  if (meetupMatch) {
    const [, , month, day, hours, minutes, ampm] = meetupMatch;
    const year = new Date().getFullYear();
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
    let hour = parseInt(hours, 10);
    if (ampm.toUpperCase() === "PM" && hour !== 12) {
      hour += 12;
    } else if (ampm.toUpperCase() === "AM" && hour === 12) {
      hour = 0;
    }
    return new Date(
      year,
      monthIndex,
      parseInt(day, 10),
      hour,
      parseInt(minutes, 10),
    );
  }

  return null;
}

export async function GET() {
  const calendar = ical({ name: "Lille Events" });

  const events = await getAllPosts();

  calendar.method(ICalCalendarMethod.REQUEST);

  events.forEach((e) => {
    e.events.forEach((event) => {
      const startTime = parseEventDate(event.time);

      if (!startTime) {
        return;
      }

      let endTime: Date;
      if (event.endTime) {
        const parsedEndTime = parseEventDate(event.endTime);
        endTime =
          parsedEndTime || new Date(startTime.getTime() + 60 * 60 * 1000);
      } else {
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }

      calendar.createEvent({
        start: startTime,
        end: endTime,
        summary: event.title,
        description: event.title,
        url: event.link,
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
