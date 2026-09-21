import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

test.describe("Каталог: поиск по навыку", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let hostBooking: BookingPage;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-search");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;

    hostBooking = new BookingPage(hostSession.page);
    guestBooking = new BookingPage(guestSession.page);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slotDate = tomorrow.toISOString().slice(0, 10);

    const hostProfile = new ProfilePage(hostSession.page);
    await hostProfile.open();
    await hostProfile.addSkill(skillTag, "can_help");
    await expect(hostProfile.canHelpSkills).toContainText(skillTag);
    await addOpenSlot(hostSession.page, slotDate);
    await expect(hostBooking.slotsCard.first()).toBeVisible();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("по навыку находится участник со свободным слотом", {
    annotation: [{ type: "req", description: "R8.3" }],
  }, async () => {
    await test.step("Гость: открывает каталог", async () => {
      await guestBooking.openCatalog();
    });

    await test.step("Гость: ищет по навыку хоста", async () => {
      await guestBooking.searchInCatalog(skillTag);
    });

    await test.step("В выдаче нашлась карточка хоста по имени", async () => {
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Гость: открывает карточку хоста", async () => {
      await guestBooking.openPersonCard(host.name);
    });

    await test.step("Карточка хоста открыта", async () => {
      await expect(guestBooking.personName).toHaveText(host.name);
    });

    await test.step("На карточке есть календарь со слотами", async () => {
      await expect(guestBooking.calendarDay.first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test("по навыку без совпадений выдача пустая", {
    annotation: [{ type: "req", description: "R8.4" }],
  }, async () => {
    const missingTag = uniqueTag("NoSuchSkill");

    await test.step("Гость: открывает каталог", async () => {
      await guestBooking.openCatalog();
    });

    await test.step("Гость: ищет несуществующий навык", async () => {
      await guestBooking.searchInCatalog(missingTag);
    });

    await test.step("Показалось пустое состояние выдачи", async () => {
      await expect(guestBooking.catalogEmpty).toBeVisible();
    });

    await test.step("Карточек в выдаче нет", async () => {
      await expect(guestBooking.personCards).toHaveCount(0);
    });
  });

  test("собственная карточка не видна в каталоге", {
    annotation: [{ type: "req", description: "R8.2" }],
  }, async () => {
    await test.step("Гость: открывает каталог", async () => {
      await guestBooking.openCatalog();
    });

    await test.step("Гость: ищет по навыку хоста", async () => {
      await guestBooking.searchInCatalog(skillTag);
    });

    await test.step("Контроль: гость видит карточку хоста", async () => {
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Хост: открывает каталог", async () => {
      await hostBooking.openCatalog();
    });

    await test.step("Хост: ищет по своему навыку", async () => {
      await hostBooking.searchInCatalog(skillTag);
    });

    await test.step("У хоста своя карточка не находится", async () => {
      await expect(hostBooking.catalogEmpty).toBeVisible();
      await expect(hostBooking.personCards).toHaveCount(0);
    });
  });
});
