import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { prepareHost } from "../helpers/host";
import { BookingPage } from "../pages/booking-page";

test.describe("Бронирование: отмена встречи", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let guest: TestUser;
  let skillTag: string;
  let hostBooking: BookingPage;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-cancel");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;
    guest = guestSession.user;

    hostBooking = new BookingPage(hostSession.page);
    guestBooking = new BookingPage(guestSession.page);

    await prepareHost(hostSession.page, skillTag);
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("гость отменяет встречу: карточка уходит в прошедшие, отмену видят оба", {
    annotation: [
      { type: "req", description: "R3.8" },
      { type: "req", description: "R11.1" },
      { type: "req", description: "R12.2" },
      { type: "req", description: "R12.3" },
    ],
  }, async () => {
    test.setTimeout(120_000);

    await test.step("Гость: открывает каталог", async () => {
      await guestBooking.openCatalog();
    });

    await test.step("Гость: ищет хоста в каталоге по навыку", async () => {
      await guestBooking.searchInCatalog(skillTag);
    });

    await test.step("В каталоге появилась карточка хоста", async () => {
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Гость: открывает карточку хоста", async () => {
      await guestBooking.openPersonCard(host.name);
    });

    await test.step("Карточка хоста открыта", async () => {
      await expect(guestBooking.personName).toHaveText(host.name);
    });

    await test.step("Гость: выбирает день и время в календаре слотов", async () => {
      await expect(async () => {
        await guestBooking.ensureCalendarLoaded();
      }).toPass({ timeout: 10_000 });
      await guestBooking.selectFirstSlot();
    });

    await test.step("Открылся диалог подтверждения брони", async () => {
      await expect(guestBooking.confirmDialog).toBeVisible();
    });

    await test.step("Гость: подтверждает бронирование", async () => {
      await guestBooking.confirmBooking();
    });

    await test.step("Бронирование прошло успешно", async () => {
      await expect(guestBooking.confirmSuccess).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Гость: открывает «Мои встречи»", async () => {
      await expect(async () => {
        await guestBooking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
    });

    await test.step("Встреча с хостом появилась в «Ближайших»", async () => {
      await expect(guestBooking.bookingCardByName(host.name)).toBeVisible();
    });

    await test.step("Гость: отменяет встречу", async () => {
      await guestBooking.cancelBooking(host.name);
    });

    await test.step("У гостя карточка встречи ушла из «Ближайших»", async () => {
      await expect(guestBooking.bookingCardByName(host.name)).not.toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Карточка появилась в «Прошедших и отменённых» с пометкой «отменено»", async () => {
      const pastCard = guestBooking.pastCardByName(host.name);
      await expect(pastCard).toBeVisible();
      await expect(pastCard).toContainText("отменено");
    });

    await test.step("Гость: перезагружает страницу", async () => {
      await guestBooking.reload();
    });

    await test.step("После перезагрузки отмена на месте", async () => {
      const pastCard = guestBooking.pastCardByName(host.name);
      await expect(pastCard).toBeVisible();
      await expect(pastCard).toContainText("отменено");
    });

    await test.step("Хост: открывает свои «Мои встречи»", async () => {
      await hostBooking.openBookings();
    });

    await test.step("Хост видит отменённую встречу именно с этим гостем", async () => {
      const hostPastCard = hostBooking.pastCardByName(guest.name);
      await expect(hostPastCard).toBeVisible();
      await expect(hostPastCard).toContainText("отменено");
    });
  });

  test("хост отменяет бронь гостя: у гостя встреча уезжает в отменённые", {
    annotation: [{ type: "req", description: "R11.1" }],
  }, async () => {
    test.setTimeout(120_000);

    await test.step("Гость бронирует слот хоста", async () => {
      await guestBooking.bookFirstSlot(skillTag, host.name);
    });

    await test.step("Хост открывает свои встречи и отменяет бронь гостя", async () => {
      await expect(async () => {
        await hostBooking.openBookingsUntilCardVisible(guest.name);
      }).toPass({ timeout: 10_000 });
      await hostBooking.cancelBooking(guest.name);
    });

    await test.step("У хоста встреча уехала в отменённые", async () => {
      const hostPastCard = hostBooking.pastCardByName(guest.name);
      await expect(hostPastCard).toBeVisible({ timeout: 10_000 });
      await expect(hostPastCard).toContainText("отменено");
    });

    await test.step("Гость видит отменённую встречу с хостом", async () => {
      await guestBooking.openBookings();
      const guestPastCard = guestBooking.pastCardByName(host.name);
      await expect(guestPastCard).toBeVisible({ timeout: 10_000 });
      await expect(guestPastCard).toContainText("отменено");
    });
  });

  test("после отмены слот снова свободен и бронируется другим гостем", {
    annotation: [{ type: "req", description: "R11.3" }],
  }, async ({ browser }) => {
    test.setTimeout(180_000);

    await test.step("Гость бронирует слот хоста", async () => {
      await guestBooking.bookFirstSlot(skillTag, host.name);
    });

    await test.step("Гость отменяет встречу", async () => {
      await expect(async () => {
        await guestBooking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
      await guestBooking.cancelBooking(host.name);
      await expect(guestBooking.pastCardByName(host.name)).toBeVisible({
        timeout: 10_000,
      });
    });

    const guest2Session = await users.add(browser, "guest2");
    const guest2Booking = new BookingPage(guest2Session.page);

    await test.step("Второй гость бронирует тот же слот", async () => {
      await guest2Booking.bookFirstSlot(skillTag, host.name);
    });

    await test.step("У второго гостя встреча в «Ближайших»", async () => {
      await expect(async () => {
        await guest2Booking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
      await expect(guest2Booking.bookingCardByName(host.name)).toBeVisible();
    });
  });
});
