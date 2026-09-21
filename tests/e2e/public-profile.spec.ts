import { test, expect } from "@playwright/test";
import { UserRegistry, uniqueTag, type TestUser } from "../helpers/user";
import { prepareHost } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

test.describe("Публичный профиль участника", () => {
  const users = new UserRegistry();

  let host: TestUser;
  let skillTag: string;
  let learnTag: string;
  let bio: string;
  let guestBooking: BookingPage;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("CanHelp");
    learnTag = uniqueTag("WantToLearn");
    bio = `Публичный профиль, прогон ${Date.now()}`;

    const hostSession = await users.add(browser, "host");
    const guestSession = await users.add(browser, "guest");
    host = hostSession.user;
    guestBooking = new BookingPage(guestSession.page);

    const profilePage = new ProfilePage(hostSession.page);
    await profilePage.open();
    await profilePage.bioInput.fill(bio);
    await profilePage.save();
    await expect(profilePage.bioInput).toHaveValue(bio);

    await prepareHost(hostSession.page, skillTag);
    await profilePage.open();
    await profilePage.addSkill(learnTag, "want_to_learn");
    await expect(profilePage.wantToLearnSkills).toContainText(learnTag);
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("на странице участника видны имя, о себе, навыки обоих типов и слоты", {
    annotation: [
      { type: "req", description: "R5.6" },
      { type: "req", description: "R9.1" },
    ],
  }, async () => {
    await test.step("Гость находит хоста в каталоге", async () => {
      await guestBooking.openCatalog();
      await guestBooking.searchInCatalog(skillTag);
      await expect(guestBooking.personCardByName(host.name)).toBeVisible();
    });

    await test.step("Открывает страницу участника", async () => {
      await guestBooking.openPersonCard(host.name);
      await expect(guestBooking.personName).toHaveText(host.name);
    });

    await test.step("Описание из профиля видно", async () => {
      await expect(guestBooking.page.getByText(bio)).toBeVisible();
    });

    await test.step("Навык «могу помочь» на месте", async () => {
      await expect(guestBooking.personCanHelpSection).toContainText(skillTag);
    });

    await test.step("Навык «хочу разобрать» на месте", async () => {
      await expect(guestBooking.personWantToLearnSection).toContainText(learnTag);
    });

    await test.step("Свободные слоты видны", async () => {
      await expect(guestBooking.calendarDay.first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
