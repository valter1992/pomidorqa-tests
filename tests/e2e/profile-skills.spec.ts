import { test, expect, type Page } from "@playwright/test";
import { UserRegistry, uniqueTag } from "../helpers/user";
import { ProfilePage } from "../pages/profile-page";

test.describe("Навыки: дубликаты, типы и удаление", () => {
  const users = new UserRegistry();

  let page: Page;
  let profilePage: ProfilePage;

  test.beforeEach(async ({ browser }) => {
    const session = await users.add(browser, "skills");
    page = session.page;
    profilePage = new ProfilePage(page);
    await profilePage.open();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("дубликат навыка того же типа не добавляется", {
    annotation: [{ type: "req", description: "R6.3" }],
  }, async () => {
    const tag = uniqueTag("Duplicate");

    await test.step("Добавляем навык «могу помочь»", async () => {
      await profilePage.addSkill(tag, "can_help");
      await expect(profilePage.skillChip(tag)).toBeVisible();
    });

    await test.step("Добавляем тот же навык того же типа ещё раз", async () => {
      await profilePage.addSkill(tag, "can_help");
    });

    await test.step("Чип по-прежнему один", async () => {
      await expect(profilePage.skillChips).toHaveCount(1);
    });
  });

  test("тот же навык другого типа — отдельная запись", {
    annotation: [{ type: "req", description: "R6.4" }],
  }, async () => {
    const tag = uniqueTag("BothTypes");

    await test.step("Добавляем навык «могу помочь»", async () => {
      await profilePage.addSkill(tag, "can_help");
      await expect(profilePage.canHelpSkills).toContainText(tag);
    });

    await test.step("Добавляем тот же навык «хочу разобрать»", async () => {
      await profilePage.addSkill(tag, "want_to_learn");
      await expect(profilePage.wantToLearnSkills).toContainText(tag);
    });

    await test.step("Навык есть в обоих блоках — две записи", async () => {
      await expect(profilePage.skillChips).toHaveCount(2);
      await expect(profilePage.canHelpSkills).toContainText(tag);
      await expect(profilePage.wantToLearnSkills).toContainText(tag);
    });
  });

  test("навык удаляется", {
    annotation: [{ type: "req", description: "R6.5" }],
  }, async () => {
    const tag = uniqueTag("Removable");

    await test.step("Добавляем навык", async () => {
      await profilePage.addSkill(tag, "can_help");
      await expect(profilePage.skillChip(tag)).toBeVisible();
    });

    await test.step("Удаляем навык", async () => {
      await profilePage.removeSkill(tag);
    });

    await test.step("Чип исчез, блок пуст", async () => {
      await expect(profilePage.skillChip(tag)).toHaveCount(0);
      await expect(profilePage.skillChips).toHaveCount(0);
    });
  });
});
