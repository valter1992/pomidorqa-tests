import { test, expect, type Page } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { prepareHost } from "../helpers/host";
import { BookingPage } from "../pages/booking-page";

function tomorrowDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe("Слоты: правила создания и удаления", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let page: Page;
  let booking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    const session = await users.add(browser, "slots");
    host = session.user;
    page = session.page;
    booking = new BookingPage(page);
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("свободный слот создаётся на завтра", {
    annotation: [{ type: "req", description: "R3.6" }],
  }, async () => {
    await booking.openSlots();

    await test.step("Добавляем слот на завтра 12:00", async () => {
      await booking.addSlot(tomorrowDate(), "12:00");
    });

    await test.step("Карточка слота появилась", async () => {
      await expect(booking.slotsCard.first()).toBeVisible({ timeout: 10_000 });
    });
  });

  test("свободный слот удаляется", {
    annotation: [
      { type: "req", description: "R3.6" },
      { type: "req", description: "R7.4" },
    ],
  }, async () => {
    await booking.openSlots();
    await booking.addSlot(tomorrowDate(), "12:00");
    await expect(booking.slotsCard.first()).toBeVisible({ timeout: 10_000 });

    await test.step("Удаляем слот", async () => {
      await booking.removeSlot(0);
    });

    await test.step("Карточка слота исчезла", async () => {
      await expect(booking.slotsCard).toHaveCount(0, { timeout: 10_000 });
    });
  });

  test("дата в прошлом не принимается формой", {
    annotation: [{ type: "req", description: "R7.2" }],
  }, async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await booking.openSlots();

    await test.step("Пытаемся добавить слот вчера", async () => {
      await booking.addSlot(yesterday, "12:00");
    });

    await test.step("Слот не создался", async () => {
      await expect(booking.slotsCard).toHaveCount(0);
    });
  });

  test("забронированный слот не удаляется", {
    annotation: [
      { type: "req", description: "R7.3" },
      { type: "req", description: "R7.5" },
    ],
  }, async ({ browser }) => {
    test.setTimeout(120_000);

    const skillTag = uniqueTag("Playwright-booked");

    await test.step("Хост публикует навык и слот", async () => {
      await prepareHost(page, skillTag);
    });

    const guestSession = await users.add(browser, "guest");
    const guestBooking = new BookingPage(guestSession.page);

    await test.step("Гость бронирует слот хоста", async () => {
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
      await guestBooking.confirmBooking();
      await expect(guestBooking.confirmSuccess).toBeVisible({ timeout: 15_000 });
    });

    await test.step("У слота хоста нет кнопки удаления", async () => {
      await booking.openSlots();
      await expect(booking.slotsCard.first()).toBeVisible({ timeout: 10_000 });
      await expect(
        booking.slotsCard.first().getByRole("button", { name: "Удалить" })
      ).toHaveCount(0);
    });
  });
});
