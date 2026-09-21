import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

// Гонка за слот: двое гостей открывают один свободный слот до подтверждения —
// бронирует первый, второй получает ошибку занятости, встреча видна обоим.
// Участники заводятся через API: тест проверяет бронирование, а не регистрацию.
// beforeEach поднимает всех троих и публикует навык и слот хоста, afterEach
// удаляет аккаунты и закрывает контексты даже при падении теста.

test.describe("Бронирование: основной путь и гонка за слот", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let guest: TestUser;
  let skillTag: string;
  let hostBooking: BookingPage;
  let guestBooking: BookingPage;
  let guest2Booking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("Playwright-demo");

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    const guest2Session = await users.add(browser, "guest2");
    host = hostSession.user;
    guest = guestSession.user;

    hostBooking = new BookingPage(hostSession.page);
    guestBooking = new BookingPage(guestSession.page);
    guest2Booking = new BookingPage(guest2Session.page);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slotDate = tomorrow.toISOString().slice(0, 10);

    // Подготовку проверяем здесь же — каждую часть на своей странице:
    // если навык или слот молча не сохранились, падение укажет
    // на подготовку, а не на гонку гостей.
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

  test("первый гость бронирует слот, второй видит ошибку занятости, встреча видна обоим", {
    annotation: [
      { type: "req", description: "R3.7" },
      { type: "req", description: "R3.9" },
      { type: "req", description: "R10.4" },
      { type: "req", description: "R12.1" },
    ],
  }, async () => {
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

    // Модалку guest2 открываем ДО confirm у guest: пока слот в UI ещё
    // свободен — оба «человек открыл и отошёл».
    await test.step("Гость2: открывает каталог", async () => {
      await guest2Booking.openCatalog();
    });

    await test.step("Гость2: ищет хоста в каталоге по навыку", async () => {
      await guest2Booking.searchInCatalog(skillTag);
    });

    await test.step("В каталоге появилась карточка хоста", async () => {
      await expect(guest2Booking.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Гость2: открывает карточку хоста", async () => {
      await guest2Booking.openPersonCard(host.name);
    });

    await test.step("Карточка хоста открыта", async () => {
      await expect(guest2Booking.personName).toHaveText(host.name);
    });

    await test.step("Гость2: выбирает день и время в календаре слотов", async () => {
      await expect(async () => {
        await guest2Booking.ensureCalendarLoaded();
      }).toPass({ timeout: 10_000 });
      await guest2Booking.selectFirstSlot();
    });

    await test.step("У гостя2 тоже открыт диалог подтверждения брони", async () => {
      await expect(guest2Booking.confirmDialog).toBeVisible();
    });

    await test.step("Гость: подтверждает бронирование первым", async () => {
      await guestBooking.confirmBooking();
    });

    await test.step("Бронирование первого гостя прошло успешно", async () => {
      await expect(guestBooking.confirmSuccess).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Гость2: подтверждает бронирование того же слота вторым", async () => {
      await guest2Booking.confirmBooking();
    });

    await test.step("Гость2 видит ошибку: слот уже занят", async () => {
      await expect(guest2Booking.confirmError).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Гость: открывает «Мои встречи»", async () => {
      await expect(async () => {
        await guestBooking.openBookingsUntilCardVisible(host.name);
      }).toPass({ timeout: 10_000 });
    });

    await test.step("Встреча с хостом появилась у гостя в «Ближайших»", async () => {
      await expect(guestBooking.bookingCardByName(host.name)).toBeVisible();
    });

    await test.step("Хост: открывает свои «Мои встречи»", async () => {
      await expect(async () => {
        await hostBooking.openBookingsUntilCardVisible(guest.name);
      }).toPass({ timeout: 10_000 });
    });

    await test.step("Встреча с гостем появилась у хоста в «Ближайших»", async () => {
      await expect(hostBooking.bookingCardByName(guest.name)).toBeVisible();
    });
  });
});
