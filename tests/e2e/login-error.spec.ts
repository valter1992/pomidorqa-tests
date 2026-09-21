import { test, expect, type Page } from "@playwright/test";
import { UserRegistry, logIn } from "../helpers/user";

// Негативный вход: при неверном email ИЛИ пароле участник видит одну и ту же
// понятную ошибку — без уточнения, что именно неверно, из соображений безопасности.
// Живой аккаунт для проверки заводится через API: тест проверяет форму входа,
// а не регистрацию. afterEach удаляет аккаунт и закрывает контекст
// даже при падении теста.

test.describe("Вход: неверные данные", () => {
  const users = new UserRegistry();

  let page: Page;
  let email: string;

  test.beforeEach(async ({ browser }) => {
    const session = await users.add(browser, "logincheck");
    page = session.page;
    email = session.user.email;
  });

  test.afterEach(async () => {
    await users.cleanup();
  });

  test("вход с неверными данными — одинаковая ошибка в обоих случаях, без уточнения причины", {
    annotation: [{ type: "req", description: "R4.5" }],
  }, async () => {
    let wrongPasswordError = "";
    let unknownEmailError = "";

    await test.step("Входим с верным email, но неверным паролем", async () => {
      await logIn(page, email, "wrong-password");
    });

    await test.step("Показалась ошибка входа", async () => {
      await expect(page.getByText(/Неверный/)).toBeVisible();
    });

    await test.step("Запоминаем текст этой ошибки", async () => {
      wrongPasswordError = (await page.getByText(/Неверный/).textContent())?.trim() ?? "";
    });

    await test.step("Входим с несуществующим email", async () => {
      await logIn(page, `no-such-user-${Date.now()}@example.com`, "any-password-123");
    });

    await test.step("Снова показалась ошибка входа", async () => {
      await expect(page.getByText(/Неверный/)).toBeVisible();
    });

    await test.step("Запоминаем текст второй ошибки", async () => {
      unknownEmailError = (await page.getByText(/Неверный/).textContent())?.trim() ?? "";
    });

    await test.step("Текст ошибки одинаковый и не раскрывает, что именно неверно", async () => {
      expect(wrongPasswordError).toBe(unknownEmailError);
      expect(wrongPasswordError).toContain("Неверный");
    });
  });
});
