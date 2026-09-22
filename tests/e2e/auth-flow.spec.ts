import { test, expect, type BrowserContext } from "@playwright/test";
import {
  UserRegistry,
  makeUser,
  registerViaUi,
  logIn,
  logOut,
} from "../helpers/user";
import { ProfilePage } from "../pages/profile-page";

const REGISTER_URL = "/pomidorqa/auth/register";

test.describe("Регистрация и вход через UI", () => {
  const users = new UserRegistry();

  const anonymous: BrowserContext[] = [];

  test.afterEach(async () => {
    for (const context of anonymous.splice(0)) {
      await context.close();
    }
    await users.cleanup();
  });

  test("регистрация создаёт профиль: имя из формы, пояс Europe/Moscow", {
    annotation: [
      { type: "req", description: "R4.1" },
      { type: "req", description: "R4.3" },
    ],
  }, async ({ browser }) => {
    const session = await users.addViaUi(browser, "reg");

    const profilePage = new ProfilePage(session.page);
    await profilePage.open();

    await test.step("Профиль открылся без редиректа на вход", async () => {
      await expect(profilePage.nameInput).toBeVisible();
    });

    await test.step("Имя пришло из формы регистрации", async () => {
      await expect(profilePage.nameInput).toHaveValue(session.user.name);
    });

    await test.step("Часовой пояс по умолчанию — Europe/Moscow", async () => {
      await expect(profilePage.timezoneSelect).toHaveValue("Europe/Moscow");
    });
  });

  test("пароль короче 8 символов не принимается", {
    annotation: [{ type: "req", description: "R4.2" }],
  }, async ({ browser }) => {
    const context = await browser.newContext();
    anonymous.push(context);
    const page = await context.newPage();
    const user = { ...makeUser("shortpass", Date.now()), password: "short" };

    await registerViaUi(page, user);

    await test.step("Форма не ушла со страницы регистрации", async () => {
      await expect(page).toHaveURL(/\/auth\/register/);
    });

    await test.step("Подсказка о минимальной длине видна", async () => {
      await expect(page.getByText("Не короче 8 символов")).toBeVisible();
    });
  });

  test("без имени форма не отправляется", {
    annotation: [{ type: "req", description: "R4.1" }],
  }, async ({ browser }) => {
    const context = await browser.newContext();
    anonymous.push(context);
    const page = await context.newPage();
    const user = makeUser("noname", Date.now());

    await page.goto(REGISTER_URL);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль").fill(user.password);
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await test.step("Форма осталась на странице регистрации", async () => {
      await expect(page).toHaveURL(/\/auth\/register/);
    });

    await test.step("Аккаунт не создан: вход с этими данными не проходит", async () => {
      await logIn(page, user.email, user.password);
      await expect(page.getByText(/Неверный/)).toBeVisible();
    });
  });

  test("второй аккаунт на тот же email не создаётся", {
    annotation: [{ type: "req", description: "R4.4" }],
  }, async ({ browser }) => {
    const first = await users.add(browser, "dupemail");

    const context = await browser.newContext();
    anonymous.push(context);
    const page = await context.newPage();
    const duplicate = makeUser("duplicate", Date.now());
    await registerViaUi(page, { ...duplicate, email: first.user.email });

    await test.step("Показалась ошибка регистрации", async () => {
      await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Форма осталась на странице регистрации", async () => {
      await expect(page).toHaveURL(/\/auth\/register/);
    });
  });

  test("вход держит сессию, выход закрывает приватные страницы", {
    annotation: [
      { type: "req", description: "R4.6" },
      { type: "req", description: "R3.4" },
    ],
  }, async ({ browser }) => {
    const session = await users.add(browser, "session");
    const page = session.page;

    await test.step("Входим с кредами аккаунта", async () => {
      await logIn(page, session.user.email, session.user.password);
      await page.waitForURL((url) => !url.pathname.includes("/auth/"));
    });

    await test.step("Приватная страница доступна после входа", async () => {
      await page.goto("/pomidorqa/bookings");
      await expect(page).toHaveURL(/\/pomidorqa\/bookings/);
    });

    await test.step("Перезагрузка сессию не теряет", async () => {
      await page.reload();
      await expect(page).toHaveURL(/\/pomidorqa\/bookings/);
    });

    await test.step("Выходим", async () => {
      await logOut(page);
    });

    await test.step("Приватная страница после выхода недоступна", async () => {
      await page.goto("/pomidorqa/bookings");
      await expect(page).not.toHaveURL(/\/pomidorqa\/bookings/);
    });
  });
});
