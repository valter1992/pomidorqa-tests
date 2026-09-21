import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { prepareHost } from "../helpers/host";
import { BookingPage } from "../pages/booking-page";

test.describe("Гостевой доступ без авторизации", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let guestContext: BrowserContext;
  let guestPage: Page;
  let guest: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-guest");

    const hostSession = await users.add(browser, "host");
    host = hostSession.user;
    await prepareHost(hostSession.page, skillTag);

    guestContext = await browser.newContext();
    guestPage = await guestContext.newPage();
    guest = new BookingPage(guestPage);
  });

  test.afterEach(async () => {
    await guestContext.close();
    await users.cleanup();
  });

  test("гость видит каталог и страницу участника, но не бронирует", {
    annotation: [
      { type: "req", description: "R3.1" },
      { type: "req", description: "R3.2" },
      { type: "req", description: "R3.3" },
    ],
  }, async () => {
    await test.step("Каталог открывается без входа", async () => {
      await guest.openCatalog();
      await expect(guest.personCards.first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Гость находит хоста по навыку", async () => {
      await guest.searchInCatalog(skillTag);
      await expect(guest.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Страница участника открывается: имя и слоты видны", async () => {
      await guest.openPersonCard(host.name);
      await expect(guest.personName).toHaveText(host.name);
      await expect(guest.calendarDay.first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Гость выбирает слот: диалог подтверждения открыт", async () => {
      await guest.calendarDay.first().click();
      await guest.calendarTime.first().click();
      await expect(guest.confirmDialog).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Подтверждение брони гостю недоступно", async () => {
      await guest.confirmBooking();
      await expect
        .poll(
          async () =>
            guestPage.url().includes("/auth/") ||
            (await guest.confirmError.isVisible().catch(() => false))
        )
        .toBe(true);
    });
  });
});
