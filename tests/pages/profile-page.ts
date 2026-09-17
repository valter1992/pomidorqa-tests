import { type Locator, type Page } from "@playwright/test";

const PROFILE_URL = "/pomidorqa/profile";

export class ProfilePage {
  // Профиль: верхняя форма, все поля сохраняются одной кнопкой
  readonly nameInput: Locator;
  readonly telegramInput: Locator;
  readonly timezoneSelect: Locator;
  readonly bioInput: Locator;

  // Профиль: нижняя форма «Навыки», у неё своя кнопка
  readonly skillInput: Locator;
  readonly skillTypeSelect: Locator;
  readonly addSkillButton: Locator;
  readonly canHelpSkills: Locator;
  readonly skillChips: Locator;

  constructor(private readonly page: Page) {
    this.nameInput = page.getByLabel("Имя");
    this.telegramInput = page.getByLabel("Telegram");
    this.timezoneSelect = page.getByLabel("Часовой пояс");
    this.bioInput = page.getByLabel("О себе");

    this.skillInput = page.locator("#pomidorqa-profile-skill-input");
    this.skillTypeSelect = page.locator("#pomidorqa-profile-skill-type");
    this.addSkillButton = page.getByRole("button", { name: "Добавить" });
    this.canHelpSkills = page.getByTestId("can-help-skills");
    this.skillChips = page.locator("[data-skill-tag]");
  }

  skillChip(tag: string): Locator {
    return this.page.locator(`[data-skill-tag="${tag}"]`);
  }

  async open() {
    await this.page.goto(PROFILE_URL);
  }

  // Сохранение профиля уходит POST-ом на адрес самой страницы, а признака успеха
  // в интерфейсе нет: кнопка не меняется, сообщения не появляется. Поэтому ждём
  // ответ сервера. Промис создаём до клика — иначе ответ придёт раньше, чем мы
  // начнём его слушать, и ожидание повиснет.
  async save() {
    const saved = this.page.waitForResponse(
      (response) =>
        response.url().endsWith(PROFILE_URL) && response.request().method() === "POST"
    );
    await this.page.getByRole("button", { name: "Сохранить" }).click();
    await saved;
  }

  async addSkill(tag: string, type: "can_help" | "want_to_learn") {
    await this.skillInput.fill(tag);
    await this.skillTypeSelect.selectOption(type);
    await this.addSkillButton.click();
  }
}
