import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

// Отмена встречи: гость бронирует слот хоста и отменяет — карточка уезжает
// в «Прошедшие и отменённые» с пометкой «отменено», и это видят оба участника.
// Участники заводятся через API: тест проверяет отмену, а не регистрацию.
// afterEach удаляет оба аккаунта и закрывает контексты даже при падении теста.

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

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const slotDate = tomorrow.toISOString().slice(0, 10);

    // Подготовку проверяем здесь же — каждую часть на своей странице:
    // если навык или слот молча не сохранились, падение укажет
    // на подготовку, а не на отмену встречи.
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

  test("гость отменяет встречу: карточка уходит в прошедшие, отмену видят оба", async () => {
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
});
