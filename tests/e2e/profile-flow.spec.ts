import { test, expect, type Page } from "@playwright/test";
import { UserRegistry } from "../helpers/user";
import { ProfilePage } from "../pages/profile-page";

test.describe("Профиль: действия с полями", () => {
  const users = new UserRegistry();

  let page: Page;
  let profilePage: ProfilePage;

  test.beforeEach(async ({ browser }) => {
    const session = await users.add(browser, "profile");
    page = session.page;
    profilePage = new ProfilePage(page);
    await profilePage.open();
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("имя: вводим новое и сохраняем", {
    annotation: [
      { type: "req", description: "R3.5" },
      { type: "req", description: "R5.1" },
    ],
  }, async () => {
    const newName = `Тимур Тестович ${Date.now()}`;

    await test.step("Заполняем поле и сохраняем", async () => {
      await profilePage.nameInput.fill(newName);
      await profilePage.save();
    });

    await test.step("Перезагружаем страницу", async () => {
      await page.reload();
    });

    await test.step("Имя пришло с сервера", async () => {
      await expect(profilePage.nameInput).toHaveValue(newName);
    });
  });

  test("часовой пояс: выбираем из списка", {
    annotation: [
      { type: "req", description: "R3.5" },
      { type: "req", description: "R5.3" },
    ],
  }, async () => {
    const timezone = "Asia/Yekaterinburg";

    await test.step("По умолчанию выбран Europe/Moscow", async () => {
      await expect(profilePage.timezoneSelect).toHaveValue("Europe/Moscow");
    });

    await test.step("Выбираем другой часовой пояс и сохраняем", async () => {
      await profilePage.timezoneSelect.selectOption(timezone);
      await profilePage.save();
    });

    await test.step("Перезагружаем страницу", async () => {
      await page.reload();
    });

    await test.step("Выбранный пояс пришёл с сервера", async () => {
      await expect(profilePage.timezoneSelect).toHaveValue(timezone);
    });
  });

  test("telegram: заполняем пустое поле", {
    annotation: [
      { type: "req", description: "R3.5" },
      { type: "req", description: "R5.2" },
    ],
  }, async () => {
    const telegram = `@qa_timur_cat${Date.now()}`;

    await test.step("Поле Telegram пустое", async () => {
      await expect(profilePage.telegramInput).toHaveValue("");
    });

    await test.step("Заполняем Telegram и сохраняем", async () => {
      await profilePage.telegramInput.fill(telegram);
      await profilePage.save();
    });

    await test.step("Перезагружаем страницу", async () => {
      await page.reload();
    });

    await test.step("Telegram пришёл с сервера", async () => {
      await expect(profilePage.telegramInput).toHaveValue(telegram);
    });
  });

  test("о себе: заполняем многострочное поле", {
    annotation: [
      { type: "req", description: "R3.5" },
      { type: "req", description: "R5.4" },
    ],
  }, async () => {
    const bio = `QA-инженер, прогон ${Date.now()}. Пытаюсь разобраться в Playwright.`;

    await test.step("Заполняем «О себе» и сохраняем", async () => {
      await profilePage.bioInput.fill(bio);
      await profilePage.save();
    });

    await test.step("Перезагружаем страницу", async () => {
      await page.reload();
    });

    await test.step("Текст «О себе» пришёл с сервера", async () => {
      await expect(profilePage.bioInput).toHaveValue(bio);
    });
  });

  test("навык: заполняем, выбираем тип и добавляем", {
    annotation: [
      { type: "req", description: "R3.5" },
      { type: "req", description: "R6.2" },
    ],
  }, async () => {
    const skillTag = `Playwright-demo-${Date.now()}`;

    await test.step("Добавляем навык «могу помочь»", async () => {
      await profilePage.addSkill(skillTag, "can_help");
    });

    await test.step("Навык появился в блоке «могу помочь»", async () => {
      await expect(profilePage.canHelpSkills).toContainText(skillTag);
    });
  });

  test("негатив: пустой навык не добавляется", {
    annotation: [{ type: "req", description: "R6.6" }],
  }, async () => {
    await test.step("Поле навыка пустое", async () => {
      await expect(profilePage.skillInput).toHaveValue("");
    });

    await test.step("Жмём «Добавить», не заполнив поле", async () => {
      await profilePage.addSkillButton.click();
    });

    await test.step("Ни одного навыка не появилось", async () => {
      await expect(profilePage.skillChips).toHaveCount(0);
      await expect(profilePage.canHelpSkills).toBeHidden();
    });
  });

  test("негатив: навык «хочу разобрать» не попадает в блок «могу помочь»", {
    annotation: [{ type: "req", description: "R6.1" }],
  }, async () => {
    const runId = Date.now();
    const canHelpTag = `CanHelp-${runId}`;
    const wantToLearnTag = `WantToLearn-${runId}`;

    await test.step("Добавляем навык «могу помочь»", async () => {
      await profilePage.addSkill(canHelpTag, "can_help");
    });

    await test.step("Навык «могу помочь» появился", async () => {
      await expect(profilePage.skillChip(canHelpTag)).toBeVisible();
    });

    await test.step("Добавляем навык «хочу разобрать»", async () => {
      await profilePage.addSkill(wantToLearnTag, "want_to_learn");
    });

    await test.step("Навык «хочу разобрать» появился", async () => {
      await expect(profilePage.skillChip(wantToLearnTag)).toBeVisible();
    });

    await test.step("Навыки разошлись по своим блокам", async () => {
      await expect(profilePage.skillChips).toHaveCount(2);
      await expect(profilePage.canHelpSkills).toContainText(canHelpTag);
      await expect(profilePage.canHelpSkills).not.toContainText(wantToLearnTag);
    });
  });

  test("форма профиля: три поля сохраняются за один раз", {
    annotation: [{ type: "req", description: "R3.5" }],
  }, async () => {
    const runId = Date.now();
    const name = `Тимур Тестовый ${runId}`;
    const telegram = `@qa_timur_${runId}`;
    const bio = `QA-инженер, прогон ${runId}. Проверяю форму профиля целиком.`;

    await test.step("Заполняем Имя, Telegram и «О себе», сохраняем разом", async () => {
      await profilePage.nameInput.fill(name);
      await profilePage.telegramInput.fill(telegram);
      await profilePage.bioInput.fill(bio);
      await profilePage.save();
    });

    await test.step("Перезагружаем страницу", async () => {
      await page.reload();
    });

    await test.step("Все три значения пришли с сервера", async () => {
      await expect.soft(profilePage.nameInput).toHaveValue(name);
      await expect.soft(profilePage.telegramInput).toHaveValue(telegram);
      await expect.soft(profilePage.bioInput).toHaveValue(bio);
    });
  });
});
