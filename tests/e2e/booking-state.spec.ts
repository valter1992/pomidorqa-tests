import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { prepareHost } from "../helpers/host";
import { BookingPage } from "../pages/booking-page";
import { ProfilePage } from "../pages/profile-page";

test.describe("Состояния брони и каталога", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let hostBooking: BookingPage;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-state");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;
    hostBooking = new BookingPage(hostSession.page);
    guestBooking = new BookingPage(guestSession.page);
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("после брони слот исчезает со страницы участника, встреча в ближайших", {
    annotation: [
      { type: "req", description: "R10.3" },
      { type: "req", description: "R9.2" },
      { type: "req", description: "R8.1" },
    ],
  }, async () => {
    let personUrl: string | null = null;
    test.setTimeout(120_000);
    await prepareHost(hostBooking.page, skillTag);

    await test.step("Гость бронирует слот хоста", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
      personUrl = await guestBooking.personCardByName(host.name).getAttribute("href");
      await guestBooking.openPersonCard(host.name);
      await expect(guestBooking.personName).toHaveText(host.name);
      await expect(async () => {
        await guestBooking.ensureCalendarLoaded();
      }).toPass({ timeout: 10_000 });
      await guestBooking.selectFirstSlot();
      await expect(guestBooking.confirmDialog).toBeVisible();
      await guestBooking.confirmBooking();
      await expect(guestBooking.confirmSuccess).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Встреча появилась у гостя в «Ближайших»", async () => {
      await expect(async () => {
        await guestBooking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
      await expect(guestBooking.bookingCardByName(host.name)).toBeVisible();
    });

    await test.step("Хост исчез из каталога: свободных слотов нет", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.personCards).toHaveCount(0, { timeout: 10_000 });
    });

    await test.step("На странице хоста забронированный слот не показывается", async () => {
      expect(personUrl).toBeTruthy();
      await guestBooking.page.goto(personUrl!);
      await expect(guestBooking.personName).toHaveText(host.name);
      await expect(guestBooking.calendarDay).toHaveCount(0, { timeout: 10_000 });
    });
  });

  test("закрытие диалога без подтверждения не создаёт бронь", {
    annotation: [{ type: "req", description: "R10.5" }],
  }, async () => {
    test.setTimeout(120_000);
    await prepareHost(hostBooking.page, skillTag);

    await test.step("Гость открывает диалог подтверждения", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
      await guestBooking.openPersonCard(host.name);
      await expect(guestBooking.personName).toHaveText(host.name);
      await expect(async () => {
        await guestBooking.ensureCalendarLoaded();
      }).toPass({ timeout: 10_000 });
      await guestBooking.selectFirstSlot();
      await expect(guestBooking.confirmDialog).toBeVisible();
    });

    await test.step("Закрывает без подтверждения", async () => {
      await guestBooking.closeConfirmDialog();
      await expect(guestBooking.confirmDialog).toBeHidden();
    });

    await test.step("В «Моих встречах» пусто", async () => {
      await guestBooking.openBookings();
      await expect(
        guestBooking.page.locator("[data-booking-id]")
      ).toHaveCount(0);
    });
  });

  test("без свободного слота участник в каталоге не находится", {
    annotation: [{ type: "req", description: "R8.1" }],
  }, async () => {
    const profilePage = new ProfilePage(hostBooking.page);

    await test.step("Хост добавляет навык, но не создаёт слот", async () => {
      await profilePage.open();
      await profilePage.addSkill(skillTag, "can_help");
      await expect(profilePage.canHelpSkills).toContainText(skillTag);
    });

    await test.step("Поиск по навыку хоста ничего не находит", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.catalogEmpty).toBeVisible({ timeout: 10_000 });
      await expect(guestBooking.personCards).toHaveCount(0);
    });
  });

  test("встречи делятся на ближайшие и прошедшие", {
    annotation: [{ type: "req", description: "R12.2" }],
  }, async () => {
    await test.step("Обе секции «Моих встреч» присутствуют", async () => {
      await guestBooking.openBookings();
      await expect(guestBooking.bookingsUpcomingSection).toBeVisible();
      await expect(
        guestBooking.page.getByRole("heading", { name: "Прошедшие и отменённые" })
      ).toBeVisible();
    });
  });
});
