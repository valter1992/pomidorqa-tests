import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

test.describe("Часовой пояс слотов", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let hostBooking: BookingPage;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-tz");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;
    hostBooking = new BookingPage(hostSession.page);
    guestBooking = new BookingPage(guestSession.page);

    const profilePage = new ProfilePage(hostSession.page);
    await profilePage.open();
    await profilePage.addSkill(skillTag, "can_help");
    await expect(profilePage.canHelpSkills).toContainText(skillTag);

    await test.step("Хост переключает пояс на Asia/Yekaterinburg", async () => {
      await profilePage.timezoneSelect.selectOption("Asia/Yekaterinburg");
      await profilePage.save();
    });

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await addOpenSlot(hostSession.page, tomorrow.toISOString().slice(0, 10), "12:00");
    await expect(hostBooking.slotsCard.first()).toBeVisible();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("время слота показывается гостю в поясе владельца", {
    annotation: [{ type: "req", description: "R5.5" }],
  }, async () => {
    await test.step("Гость открывает страницу хоста", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
      await guestBooking.openPersonCard(host.name);
      await expect(guestBooking.personName).toHaveText(host.name);
    });

    await test.step("Календарь загрузился", async () => {
      await expect(guestBooking.calendarDay.first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Слот показывает 12:00 — время владельца, не московское 10:00", async () => {
      await guestBooking.calendarDay.first().click();
      await expect(guestBooking.calendarTime.first()).toContainText("12:00", {
        timeout: 10_000,
      });
    });
  });
});
