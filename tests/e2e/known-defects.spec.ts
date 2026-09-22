import { test, expect, type Page } from "@playwright/test";
import { UserRegistry, uniqueTag } from "../helpers/user";
import { addOpenSlot } from "../helpers/host";
import { ProfilePage } from "../pages/profile-page";
import { BookingPage } from "../pages/booking-page";

test.describe("Известные дефекты: поиск в каталоге", () => {
  const users = new UserRegistry();

  let page: Page;
  let skillTag: string;

  test.beforeEach(async ({ browser }) => {
    skillTag = uniqueTag("WantOnly");

    const session = await users.add(browser, "wantonly");
    page = session.page;

    const profilePage = new ProfilePage(page);
    await profilePage.open();
    await profilePage.addSkill(skillTag, "want_to_learn");
    await expect(profilePage.wantToLearnSkills).toContainText(skillTag);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await addOpenSlot(page, tomorrow.toISOString().slice(0, 10));
    const booking = new BookingPage(page);
    await expect(booking.slotsCard.first()).toBeVisible();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test.fail("поиск по навыку «хочу разобрать» не находит участника", {
    annotation: [
      { type: "req", description: "R8.3" },
      { type: "known_defect", description: "каталог ищет по навыкам обоих типов, а не только «могу помочь»" },
    ],
  }, async ({ browser }) => {
    const guestSession = await users.add(browser, "guest");
    const guest = new BookingPage(guestSession.page);

    await test.step("Гость ищет по навыку из «хочу разобрать»", async () => {
      await guest.openCatalog();
      await guest.searchInCatalog(skillTag);
    });

    await test.step("Выдача пустая: только «могу помочь» участвует в поиске", async () => {
      await expect(guest.personCards).toHaveCount(0, { timeout: 10_000 });
    });
  });
});
