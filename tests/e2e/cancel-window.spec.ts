import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

function moscowSlotIn(minutesFromNow: number): { date: string; time: string } {
  const soon = new Date(Date.now() + minutesFromNow * 60_000);
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(soon);
  const [date, time] = formatted.split(" ");
  return { date, time };
}

test.describe("Окно отмены бронирования", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-window");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;
    guestBooking = new BookingPage(guestSession.page);

    const profilePage = new ProfilePage(hostSession.page);
    await profilePage.open();
    await profilePage.addSkill(skillTag, "can_help");
    await expect(profilePage.canHelpSkills).toContainText(skillTag);

    const slot = moscowSlotIn(90);
    await addOpenSlot(hostSession.page, slot.date, slot.time);
    const hostBooking = new BookingPage(hostSession.page);
    await expect(hostBooking.slotsCard.first()).toBeVisible();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("отмена менее чем за 2 часа до начала запрещена", {
    annotation: [{ type: "req", description: "R11.2" }],
  }, async () => {
    test.setTimeout(120_000);

    await test.step("Гость бронирует слот через ~90 минут", async () => {
      await guestBooking.bookFirstSlot(skillTag, host.name);
    });

    await test.step("Гость открывает «Мои встречи»", async () => {
      await expect(async () => {
        await guestBooking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
    });

    await test.step("Гость пытается отменить встречу", async () => {
      await guestBooking.cancelBooking(host.name);
    });

    await test.step("Встреча осталась в «Ближайших» — окно отмены закрыто", async () => {
      await expect(guestBooking.bookingCardByName(host.name)).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
